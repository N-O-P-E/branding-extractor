import IssueCard from '../components/IssueCard';
import RepoSelector from '../components/RepoSelector';
import ToolButton from '../components/ToolButton';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { PageIssue, RecordingCompleteMessage } from '@extension/shared';

interface VideoUploadStatus {
  status: 'uploading' | 'success' | 'error';
  videoUrl?: string;
  error?: string;
}

interface HomeViewProps {
  onOpenSettings: (section?: string) => void;
  onOpenWizard?: (chapter: 1 | 2) => void;
  onMount?: () => void;
  themeLabel?: string;
  onRecordingComplete?: (data: RecordingCompleteMessage['payload']) => void;
  onRecordingStateChange?: (active: boolean) => void;
  onVideoUploadUpdate?: (status: VideoUploadStatus) => void;
}

/** Check and request optional cookies permission for video upload.
 *  MUST be called synchronously from a user gesture handler — async work before this will lose the gesture context. */
const requestVideoUploadPermissions = async (): Promise<boolean> => {
  const perms = { permissions: ['cookies' as const] };
  const granted = await chrome.permissions.contains(perms);
  if (granted) return true;
  return chrome.permissions.request(perms);
};

const fetchWithTimeout = (url: string, options: RequestInit = {}, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
};

const API_TIMEOUT = 30_000;
const UPLOAD_TIMEOUT = 300_000;

const colors = {
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  purpleAccent: 'var(--accent-subtle)',
  purple500: 'var(--accent-primary)',
  border: 'var(--border-default)',
  divider: 'var(--border-subtle)',
  green: 'var(--status-success)',
  red: '#ef4444',
} as const;

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

/** Upload video via GitHub's user-attachments system (inline embed in issues).
 *  Delegates to background service worker which can set restricted headers like Cookie. */
const uploadViaUserAttachments = async (
  owner: string,
  repo: string,
  filename: string,
  contentType: string,
  blob: Blob,
  pat: string,
): Promise<string> => {
  // Get repo ID
  const repoRes = await fetchWithTimeout(
    `https://api.github.com/repos/${owner}/${repo}`,
    {
      headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json' },
    },
    API_TIMEOUT,
  );
  if (!repoRes.ok) throw new Error('Failed to get repo');
  const repoData = await repoRes.json();
  const repositoryId = repoData.id;

  // Check we have the optional cookies permission before accessing cookies API
  const hasPerms = await chrome.permissions.contains({
    permissions: ['cookies'],
  });
  if (!hasPerms) throw new Error('MISSING_PERMISSIONS');

  // Get GitHub session cookies — use url for reliable matching across .github.com subdomains
  const cookies = await chrome.cookies.getAll({ url: 'https://github.com' });
  const cookieStr = cookies.map((c: chrome.cookies.Cookie) => `${c.name}=${c.value}`).join('; ');
  if (!cookieStr.includes('user_session'))
    throw new Error('No GitHub session — make sure you are logged into github.com');

  // Convert blob to ArrayBuffer for message transfer
  const videoArrayBuffer = await blob.arrayBuffer();

  // Send to background service worker which can set Cookie headers
  const response = (await chrome.runtime.sendMessage({
    type: 'UPLOAD_VIDEO_ATTACHMENT',
    payload: { repositoryId, fileName: filename, contentType, videoArrayBuffer, cookieStr },
  })) as { success: boolean; videoUrl?: string; error?: string };

  if (!response?.success || !response.videoUrl) {
    throw new Error(response?.error || 'Upload failed');
  }

  return response.videoUrl;
};

/** Fallback: upload video via GitHub release assets (download link) */
const uploadViaReleaseAsset = async (
  owner: string,
  repo: string,
  filename: string,
  contentType: string,
  blob: Blob,
  pat: string,
): Promise<string> => {
  const releaseTag = 'vir-screenshots';
  let releaseId: number;
  const releaseRes = await fetchWithTimeout(
    `https://api.github.com/repos/${owner}/${repo}/releases/tags/${releaseTag}`,
    {
      headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json' },
    },
    API_TIMEOUT,
  );
  if (releaseRes.ok) {
    releaseId = (await releaseRes.json()).id;
  } else {
    const createRes = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${repo}/releases`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tag_name: releaseTag,
          name: 'Visual Issue Screenshots',
          body: 'Screenshots uploaded by Visual Issue Reporter. Do not delete this release.',
        }),
      },
      UPLOAD_TIMEOUT,
    );
    releaseId = (await createRes.json()).id;
  }

  const arrayBuffer = await blob.arrayBuffer();
  const uploadRes = await fetchWithTimeout(
    `https://uploads.github.com/repos/${owner}/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(filename)}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': contentType },
      body: arrayBuffer,
    },
    UPLOAD_TIMEOUT,
  );
  if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
  return (await uploadRes.json()).browser_download_url;
};

export default function HomeView({
  onOpenSettings,
  onMount,
  themeLabel,
  onRecordingComplete,
  onRecordingStateChange,
  onVideoUploadUpdate,
}: HomeViewProps) {
  const [repos, setRepos] = useState<string[]>([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [activeTool, setActiveTool] = useState<'select' | 'pencil' | 'inspect' | null>(null);
  const [issues, setIssues] = useState<PageIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [patConnected, setPatConnected] = useState(false);
  const [autoFixConfigured, setAutoFixConfigured] = useState(false);
  const [autoFixStatusLabel, setAutoFixStatusLabel] = useState('');
  const [autoFixStatusColor, setAutoFixStatusColor] = useState('');
  const [branches, setBranches] = useState<Array<{ name: string; default: boolean }>>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [branchesLoading, setBranchesLoading] = useState(false);

  // Recording state
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState('');
  const [micEnabled, setMicEnabled] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef(0);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs for mid-recording mic toggle
  const audioCtxRef = useRef<AudioContext | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    onMount?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load settings from storage
  useEffect(() => {
    chrome.storage.local.get(['repoList', 'selectedRepo', 'autoFixSettings']).then(result => {
      const repoList = (result.repoList as string[]) ?? [];
      if (repoList.length) setRepos(repoList);
      if (result.selectedRepo) setSelectedRepo(result.selectedRepo as string);
      if (result.autoFixSettings) {
        const s = result.autoFixSettings as { anthropicApiKey?: string };
        setAutoFixConfigured(!!s.anthropicApiKey);
      }
    });
    chrome.runtime.sendMessage({ type: 'CHECK_TOKEN_STATUS' }, (response: { connected: boolean }) => {
      setPatConnected(!!response?.connected);
    });
  }, []);

  // Check auto-fix status across all repos
  useEffect(() => {
    if (!autoFixConfigured) {
      setAutoFixStatusLabel('Not configured');
      setAutoFixStatusColor(colors.textSecondary);
      return;
    }
    if (repos.length === 0) {
      setAutoFixStatusLabel('No repos');
      setAutoFixStatusColor(colors.textSecondary);
      return;
    }
    let completed = 0;
    let readyCount = 0;
    for (const repo of repos) {
      let hasSecret = false;
      let hasWorkflow = false;
      let checks = 0;
      const resolve = () => {
        checks++;
        if (checks === 2) {
          if (hasSecret && hasWorkflow) readyCount++;
          completed++;
          if (completed === repos.length) {
            if (readyCount === repos.length) {
              setAutoFixStatusLabel('Ready');
              setAutoFixStatusColor(colors.green);
            } else if (readyCount > 0) {
              setAutoFixStatusLabel(`${readyCount}/${repos.length} repos ready`);
              setAutoFixStatusColor('var(--status-warning)');
            } else {
              setAutoFixStatusLabel('Setup incomplete');
              setAutoFixStatusColor('var(--status-warning)');
            }
          }
        }
      };
      chrome.runtime.sendMessage(
        { type: 'CHECK_REPO_SECRET', payload: { repo, secretName: 'ANTHROPIC_API_KEY' } },
        (response: { success: boolean; exists?: boolean }) => {
          hasSecret = !!response?.exists;
          resolve();
        },
      );
      chrome.runtime.sendMessage(
        { type: 'CHECK_REPO_WORKFLOW', payload: { repo } },
        (response: { success: boolean; exists?: boolean }) => {
          hasWorkflow = !!response?.exists;
          resolve();
        },
      );
    }
  }, [autoFixConfigured, repos]);

  // Listen for tool switch messages from content-UI
  useEffect(() => {
    const listener = (message: { type: string; payload?: { tool: string } }) => {
      if (message.type === 'TOOL_SWITCHED') {
        const tool = message.payload?.tool;
        setActiveTool(tool ? (tool as 'select' | 'pencil' | 'inspect') : null);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Recording timer
  useEffect(() => {
    if (recording) {
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recording]);

  // Fetch issues when repo changes or on mount
  const fetchIssues = useCallback(async () => {
    if (!selectedRepo) return;
    setLoading(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        const response = await chrome.runtime.sendMessage({
          type: 'FETCH_PAGE_ISSUES',
          payload: { pageUrl: tab.url },
        });
        if (response?.success && response.issues) {
          setIssues(response.issues as PageIssue[]);
        }
      }
    } catch {
      // Silently fail — issues section will show empty
    } finally {
      setLoading(false);
    }
  }, [selectedRepo]);

  useEffect(() => {
    void fetchIssues();
  }, [fetchIssues]);

  // Re-fetch issues when the active tab URL changes or user switches tabs
  useEffect(() => {
    const onUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.url || changeInfo.status === 'complete') {
        setToolError('');
        setActiveTool(null);
        void fetchIssues();
      }
    };
    const onActivated = () => {
      setToolError('');
      setActiveTool(null);
      void fetchIssues();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onActivated.addListener(onActivated);
    return () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onActivated.removeListener(onActivated);
    };
  }, [fetchIssues]);

  const handleRepoChange = (repo: string) => {
    setSelectedRepo(repo);
    setSelectedBranch('');
    setBranches([]);
    chrome.storage.local.set({ selectedRepo: repo, selectedBranch: '' });
  };

  // Fetch branches when repo changes
  useEffect(() => {
    if (!selectedRepo) return;
    setBranchesLoading(true);
    chrome.runtime.sendMessage(
      { type: 'FETCH_BRANCHES', payload: { repo: selectedRepo } },
      (response: { success: boolean; branches?: Array<{ name: string; default: boolean }> }) => {
        setBranchesLoading(false);
        if (response?.success && response.branches) {
          setBranches(response.branches);
          // Load saved branch or use default
          chrome.storage.local.get('selectedBranch').then(result => {
            const saved = result.selectedBranch as string | undefined;
            if (saved && response.branches!.some(b => b.name === saved)) {
              setSelectedBranch(saved);
            } else {
              const defaultBranch = response.branches!.find(b => b.default)?.name ?? '';
              setSelectedBranch(defaultBranch);
              chrome.storage.local.set({ selectedBranch: defaultBranch });
            }
          });
        }
      },
    );
  }, [selectedRepo]);

  const [toolError, setToolError] = useState('');

  const handleToolClick = (tool: 'select' | 'pencil' | 'inspect') => {
    setActiveTool(tool);
    setToolError('');
    chrome.runtime.sendMessage(
      { type: 'ACTIVATE_TOOL', payload: { tool } },
      (response: { success: boolean; error?: string }) => {
        if (chrome.runtime.lastError || (response && !response.success)) {
          setActiveTool(null);
          const msg = response?.error ?? chrome.runtime.lastError?.message ?? 'Unknown error';
          if (msg.includes('Receiving end does not exist')) {
            setToolError('Refresh the page first, then try again.');
          } else {
            setToolError(msg);
          }
        }
      },
    );
  };

  const finishRecording = useCallback(
    async (blob: Blob, mimeType: string, durationMs: number) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const pageUrl = tab?.url ?? '';

      // Navigate to create-issue view immediately — upload happens in background
      onRecordingComplete?.({ mimeType, durationMs, pageUrl });
      onVideoUploadUpdate?.({ status: 'uploading' });

      try {
        const { githubPat } = await chrome.storage.local.get('githubPat');
        const { selectedRepo } = await chrome.storage.local.get('selectedRepo');
        if (!githubPat || !selectedRepo) throw new Error('Not configured');

        const [owner, repo] = selectedRepo.split('/');
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `recording-${timestamp}.${ext}`;
        const contentType = mimeType.split(';')[0] || `video/${ext}`;

        console.log('[VIR] Video blob size:', blob.size, 'bytes, type:', blob.type);

        // Try GitHub's user-attachments upload (renders inline in issues)
        // Request optional permissions first — must happen early in the gesture chain
        const hasVideoPerms = await requestVideoUploadPermissions();
        let videoUrl: string | undefined;
        try {
          if (!hasVideoPerms) throw new Error('MISSING_PERMISSIONS');
          videoUrl = await uploadViaUserAttachments(owner, repo, filename, contentType, blob, githubPat);
          console.log('[VIR] Video uploaded via user-attachments:', videoUrl);
        } catch (uploadErr) {
          console.warn('[VIR] User-attachments upload failed, falling back to release assets:', uploadErr);
          // Fall back to release asset upload (download link only)
          videoUrl = await uploadViaReleaseAsset(owner, repo, filename, contentType, blob, githubPat);
          console.log('[VIR] Video uploaded via release assets:', videoUrl);
        }

        onVideoUploadUpdate?.({ status: 'success', videoUrl });
      } catch (err) {
        console.error('[VIR] Video upload failed:', err);
        onVideoUploadUpdate?.({ status: 'error', error: err instanceof Error ? err.message : 'Upload failed' });
      }
    },
    [onRecordingComplete, onVideoUploadUpdate],
  );

  const handleRecordClick = async () => {
    if (recording) return;
    setRecordingError('');
    setToolError('');
    // Dismiss any active tool overlay before recording
    if (activeTool) {
      setActiveTool(null);
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'DISMISS_OVERLAY' }).catch(() => {});
    }

    try {
      // Call getDisplayMedia directly from the side panel — proper previews, no offscreen doc needed
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
        selfBrowserSurface: 'exclude',
      } as DisplayMediaStreamOptions);

      // Always set up AudioContext so mic can be added mid-recording
      displayStreamRef.current = displayStream;
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const dest = audioCtx.createMediaStreamDestination();
      destRef.current = dest;

      // Connect tab audio (if any)
      const tabAudioTracks = displayStream.getAudioTracks();
      if (tabAudioTracks.length > 0) {
        const tabSource = audioCtx.createMediaStreamSource(new MediaStream(tabAudioTracks));
        tabSource.connect(dest);
      }

      // If mic is already enabled, connect it now
      let micStream: MediaStream | null = null;
      if (micEnabled) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStreamRef.current = micStream;
          const micSource = audioCtx.createMediaStreamSource(micStream);
          micSource.connect(dest);
          micSourceRef.current = micSource;
        } catch (micErr) {
          console.warn('[VIR] Mic access failed, recording without mic:', micErr);
          setMicEnabled(false);
        }
      }

      // Create combined stream: display video + mixed audio from AudioContext
      const stream = new MediaStream([...displayStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);

      let mimeType = 'video/webm;codecs=vp8,opus';
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
        mimeType = 'video/webm;codecs=vp9,opus';
      }

      chunksRef.current = [];
      recordingStartRef.current = Date.now();

      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e: BlobEvent) => {
        console.log('[VIR] Recording chunk:', e.data.size, 'bytes');
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current);
        const durationMs = Date.now() - recordingStartRef.current;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        // Stop all tracks from all streams
        displayStreamRef.current?.getTracks().forEach(t => t.stop());
        micStreamRef.current?.getTracks().forEach(t => t.stop());
        void audioCtxRef.current?.close();
        // Clear refs
        displayStreamRef.current = null;
        micStreamRef.current = null;
        micSourceRef.current = null;
        audioCtxRef.current = null;
        destRef.current = null;
        setRecording(false);
        onRecordingStateChange?.(false);
        setRecordingSeconds(0);
        // Dismiss the drawing overlay on the page
        chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
          if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'STOP_RECORDING_OVERLAY' }).catch(() => {});
        });
        void finishRecording(blob, mimeType, durationMs);
      };

      recorder.onerror = () => {
        displayStreamRef.current?.getTracks().forEach(t => t.stop());
        micStreamRef.current?.getTracks().forEach(t => t.stop());
        void audioCtxRef.current?.close();
        displayStreamRef.current = null;
        micStreamRef.current = null;
        micSourceRef.current = null;
        audioCtxRef.current = null;
        destRef.current = null;
        setRecording(false);
        onRecordingStateChange?.(false);
        setRecordingError('Recording failed');
      };

      // If user stops sharing via Chrome's "Stop sharing" button
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (recorder.state === 'recording') recorder.stop();
      });

      recorder.start(); // No timeslice — produces a single valid WebM on stop
      setRecording(true);
      onRecordingStateChange?.(true);

      // Activate transparent drawing overlay on the page
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        chrome.tabs.sendMessage(activeTab.id, { type: 'ACTIVATE_RECORDING_OVERLAY' }).catch(() => {});
      }

      // Auto-stop after 60 seconds
      maxDurationTimerRef.current = setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 60000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('Permission denied') || msg.includes('NotAllowedError')) {
        // User cancelled the picker — not an error
      } else {
        setRecordingError(msg);
      }
    }
  };

  const handleStopRecording = () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  };

  const sectionHeadingStyle: React.CSSProperties = {
    fontSize: 18,
    margin: 0,
    color: 'var(--heading-color)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  const settingsRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 0',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    width: '100%',
    color: colors.textPrimary,
    fontSize: 14,
    textAlign: 'left',
    transition: 'all 0.15s',
  };

  return (
    <div
      style={{
        flex: 1,
        background: 'var(--bg-primary)',
        color: colors.textPrimary,
        boxSizing: 'border-box',
      }}>
      {/* Header */}
      <div
        style={{ padding: '28px 20px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1
            style={{
              fontSize: 26,
              margin: 0,
              color: colors.textPrimary,
              lineHeight: 1.2,
            }}>
            Create visual issues
          </h1>
          <p style={{ margin: '6px 0 0', color: colors.textSecondary, fontSize: 13 }}>
            Report visual issues without switching context. Shorter dev cycles, everyone can contribute, not just
            developers.
          </p>
        </div>
        <button
          className="icon-btn"
          onClick={onOpenSettings}
          title="Settings"
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border-input)',
            borderRadius: 8,
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            padding: 0,
            flexShrink: 0,
            transition: 'all 0.15s',
            marginTop: 4,
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M7.878 5.21415L7.17474 5.05186C6.58003 4.91462 5.95657 5.09343 5.525 5.525C5.09343 5.95657 4.91462 6.58003 5.05186 7.17474L5.21415 7.878C5.40122 8.6886 5.06696 9.53036 4.37477 9.99182L3.51965 10.5619C3.03881 10.8825 2.75 11.4221 2.75 12C2.75 12.5779 3.03881 13.1175 3.51965 13.4381L4.37477 14.0082C5.06696 14.4696 5.40122 15.3114 5.21415 16.122L5.05186 16.8253C4.91462 17.42 5.09343 18.0434 5.525 18.475C5.95657 18.9066 6.58003 19.0854 7.17474 18.9481L7.878 18.7858C8.6886 18.5988 9.53036 18.933 9.99182 19.6252L10.5619 20.4804C10.8825 20.9612 11.4221 21.25 12 21.25C12.5779 21.25 13.1175 20.9612 13.4381 20.4804L14.0082 19.6252C14.4696 18.933 15.3114 18.5988 16.122 18.7858L16.8253 18.9481C17.42 19.0854 18.0434 18.9066 18.475 18.475C18.9066 18.0434 19.0854 17.42 18.9481 16.8253L18.7858 16.122C18.5988 15.3114 18.933 14.4696 19.6252 14.0082L20.4804 13.4381C20.9612 13.1175 21.25 12.5779 21.25 12C21.25 11.4221 20.9612 10.8825 20.4804 10.5619L19.6252 9.99182C18.933 9.53036 18.5988 8.6886 18.7858 7.878L18.9481 7.17473C19.0854 6.58003 18.9066 5.95657 18.475 5.525C18.0434 5.09343 17.42 4.91462 16.8253 5.05186L16.122 5.21415C15.3114 5.40122 14.4696 5.06696 14.0082 4.37477L13.4381 3.51965C13.1175 3.03881 12.5779 2.75 12 2.75C11.4221 2.75 10.8825 3.03881 10.5619 3.51965L9.99182 4.37477C9.53036 5.06696 8.6886 5.40122 7.878 5.21415Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M14.75 12C14.75 13.5188 13.5188 14.75 12 14.75C10.4812 14.75 9.25 13.5188 9.25 12C9.25 10.4812 10.4812 9.25 12 9.25C13.5188 9.25 14.75 10.4812 14.75 12Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Repository section */}
      <div style={{ padding: '20px 20px 0' }}>
        <RepoSelector
          selectedRepo={selectedRepo}
          repos={repos}
          onChange={handleRepoChange}
          onOpenSettings={onOpenSettings}
        />
        {/* Branch selector — inline below repo */}
        {selectedRepo && (branchesLoading || branches.length > 1) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, minWidth: 0, height: 20 }}>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              style={{ color: colors.textMuted, flexShrink: 0 }}>
              <path
                d="M6 3v12M18 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 9a9 9 0 01-9 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {branchesLoading ? (
              <span style={{ fontSize: 12, color: colors.textMuted }}>Loading...</span>
            ) : (
              <select
                value={selectedBranch}
                onChange={e => {
                  setSelectedBranch(e.target.value);
                  chrome.storage.local.set({ selectedBranch: e.target.value });
                }}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  color: colors.textSecondary,
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  outline: 'none',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  cursor: 'pointer',
                  padding: '2px 0',
                  textDecoration: 'underline',
                  textDecorationColor: colors.textMuted,
                  textUnderlineOffset: '3px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}>
                {branches.map(b => (
                  <option key={b.name} value={b.name} style={{ background: 'var(--bg-secondary)' }}>
                    {b.name}
                    {b.default ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ margin: '20px 20px 0', borderTop: `1px solid ${colors.divider}` }} />

      {/* Report section */}
      <div style={{ padding: '16px 20px 0' }}>
        <h2 style={sectionHeadingStyle}>Report</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
          <ToolButton
            icon="select"
            label="Select"
            active={activeTool === 'select'}
            disabled={recording || (activeTool !== null && activeTool !== 'select')}
            onClick={() => handleToolClick('select')}
          />
          <ToolButton
            icon="pencil"
            label="Canvas"
            active={activeTool === 'pencil'}
            disabled={recording || (activeTool !== null && activeTool !== 'pencil')}
            onClick={() => handleToolClick('pencil')}
          />
          <ToolButton
            icon="inspect"
            label="Inspect"
            active={activeTool === 'inspect'}
            disabled={recording || (activeTool !== null && activeTool !== 'inspect')}
            onClick={() => handleToolClick('inspect')}
          />
          {!recording ? (
            <ToolButton icon="record" label="Record" active={false} disabled={false} onClick={handleRecordClick} />
          ) : (
            <button
              onClick={handleStopRecording}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '12px 0',
                borderRadius: 10,
                border: '1px solid rgba(239,68,68,0.4)',
                background: 'rgba(239,68,68,0.15)',
                cursor: 'pointer',
                fontFamily: 'DM Sans, -apple-system, BlinkMacSystemFont, sans-serif',
                fontSize: 13,
                fontWeight: 500,
                color: '#fca5a5',
                transition: 'all 0.15s ease',
                boxShadow: '0 0 16px rgba(239,68,68,0.15), inset 0 0 12px rgba(239,68,68,0.05)',
              }}>
              {/* Stop icon (square) */}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="12" height="12" rx="2" fill={colors.red} />
              </svg>
              <span>Stop</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.7 }}>{formatTime(recordingSeconds)}</span>
            </button>
          )}
        </div>

        {/* Mic toggle -- shown always */}
        <button
          onClick={async () => {
            if (micEnabled) {
              setMicEnabled(false);
              // If recording, disconnect mic from the audio mix
              if (recording && micSourceRef.current && micStreamRef.current) {
                micSourceRef.current.disconnect();
                micStreamRef.current.getTracks().forEach(t => t.stop());
                micSourceRef.current = null;
                micStreamRef.current = null;
              }
              return;
            }
            setRecordingError('');
            // Check if mic permission is already granted
            let micGranted = false;
            try {
              const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
              if (recording && audioCtxRef.current && destRef.current) {
                // Mid-recording: connect this mic stream to the audio mix
                micStreamRef.current = testStream;
                const micSource = audioCtxRef.current.createMediaStreamSource(testStream);
                micSource.connect(destRef.current);
                micSourceRef.current = micSource;
              } else {
                testStream.getTracks().forEach(t => t.stop());
              }
              setMicEnabled(true);
              micGranted = true;
            } catch {
              /* Side panel can't show prompts -- open a tab instead */
            }
            if (micGranted) return;
            // Open a regular tab that can show Chrome's standard mic permission prompt
            const result = await new Promise<boolean>(resolve => {
              const listener = (msg: { type: string; granted?: boolean }) => {
                if (msg.type === 'MIC_PERMISSION_RESULT') {
                  chrome.runtime.onMessage.removeListener(listener);
                  resolve(!!msg.granted);
                }
              };
              chrome.runtime.onMessage.addListener(listener);
              chrome.tabs.create({
                url: chrome.runtime.getURL('mic-permission.html'),
                active: true,
              });
              // Timeout after 120s — give user plenty of time to accept
              setTimeout(() => {
                chrome.runtime.onMessage.removeListener(listener);
                resolve(false);
              }, 120000);
            });
            if (result) {
              setMicEnabled(true);
              // If recording, connect mic now
              if (recording && audioCtxRef.current && destRef.current) {
                try {
                  const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                  micStreamRef.current = micStream;
                  const micSource = audioCtxRef.current.createMediaStreamSource(micStream);
                  micSource.connect(destRef.current);
                  micSourceRef.current = micSource;
                } catch (micErr) {
                  console.warn('[VIR] Mic connect failed after permission grant:', micErr);
                }
              }
            } else {
              setRecordingError('Microphone permission was not granted. Try again via the mic toggle.');
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 10,
            padding: '8px 12px',
            background: micEnabled ? 'rgba(139,92,246,0.1)' : 'rgba(148,163,184,0.05)',
            border: `1px solid ${micEnabled ? 'rgba(139,92,246,0.3)' : 'rgba(148,163,184,0.1)'}`,
            borderRadius: 8,
            cursor: 'pointer',
            fontFamily: 'DM Sans, -apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: 12,
            fontWeight: 500,
            color: micEnabled ? colors.purpleAccent : colors.textSecondary,
            transition: 'all 0.15s',
            width: '100%',
          }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            {micEnabled ? (
              <>
                <path
                  d="M12 2.75C10.4812 2.75 9.25 3.98122 9.25 5.5V12C9.25 13.5188 10.4812 14.75 12 14.75C13.5188 14.75 14.75 13.5188 14.75 12V5.5C14.75 3.98122 13.5188 2.75 12 2.75Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M6.25 11C6.25 14.1756 8.82436 16.75 12 16.75C15.1756 16.75 17.75 14.1756 17.75 11"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path d="M12 17.75V21.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </>
            ) : (
              <>
                <path
                  d="M9.25 5.5C9.25 3.98122 10.4812 2.75 12 2.75C13.5188 2.75 14.75 3.98122 14.75 5.5V9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M6.25 11C6.25 14.1756 8.82436 16.75 12 16.75C15.1756 16.75 17.75 14.1756 17.75 11"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path d="M12 17.75V21.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M3.75 3.75L20.25 20.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </>
            )}
          </svg>
          {micEnabled ? 'Microphone on' : 'Microphone off'}
        </button>

        {toolError && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--status-error)' }}>{toolError}</p>}
        {recordingError && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--status-error)' }}>{recordingError}</p>
        )}
      </div>

      {/* Divider */}
      <div style={{ margin: '20px 20px 0', borderTop: `1px solid ${colors.divider}` }} />

      {/* Page Issues section */}
      <div style={{ padding: '16px 20px 0' }}>
        <h2 style={sectionHeadingStyle}>
          Page Issues
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              background: 'var(--badge-bg)',
              color: 'var(--badge-text)',
              minWidth: 22,
              height: 22,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 11,
              padding: '0 6px',
              boxSizing: 'border-box',
            }}>
            {issues.length}
          </span>
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {loading && <p style={{ fontSize: 13, color: colors.textSecondary, margin: 0 }}>Loading...</p>}
          {!loading && issues.length === 0 && (
            <p style={{ fontSize: 13, color: colors.textSecondary, margin: 0 }}>No issues found for this page.</p>
          )}
          {!loading && issues.map(issue => <IssueCard key={issue.number} issue={issue} />)}
        </div>
      </div>

      {/* Divider */}
      <div style={{ margin: '20px 20px 0', borderTop: `1px solid ${colors.divider}` }} />

      {/* Settings section */}
      <div style={{ padding: '16px 20px 24px' }}>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
        <h2 style={{ ...sectionHeadingStyle, cursor: 'pointer' }} onClick={() => onOpenSettings()}>
          Settings
        </h2>
        <div style={{ marginTop: 8 }}>
          <button className="settings-row" onClick={() => onOpenSettings('token')} style={settingsRowStyle}>
            <span>GitHub Token</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: patConnected ? colors.green : colors.textSecondary }}>
                {patConnected ? 'Connected' : 'Not connected'}
              </span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ transform: 'rotate(-90deg)', opacity: 0.3 }}>
                <path
                  d="M5.75 9.5L12 15.75L18.25 9.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
          <button className="settings-row" onClick={() => onOpenSettings('repos')} style={settingsRowStyle}>
            <span>Repositories</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: colors.textSecondary }}>
                {repos.length} {repos.length === 1 ? 'repo' : 'repos'}
              </span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ transform: 'rotate(-90deg)', opacity: 0.3 }}>
                <path
                  d="M5.75 9.5L12 15.75L18.25 9.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
          <button className="settings-row" onClick={() => onOpenSettings('theme')} style={settingsRowStyle}>
            <span>Theme</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: colors.textSecondary }}>{themeLabel || 'Default'}</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ transform: 'rotate(-90deg)', opacity: 0.3 }}>
                <path
                  d="M5.75 9.5L12 15.75L18.25 9.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
          <button
            className="settings-row"
            onClick={() => onOpenSettings('autofix')}
            style={{ ...settingsRowStyle, borderBottom: 'none' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Auto-fix with Claude Code</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: autoFixStatusColor }}>{autoFixStatusLabel}</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ transform: 'rotate(-90deg)', opacity: 0.3 }}>
                <path
                  d="M5.75 9.5L12 15.75L18.25 9.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
        </div>
      </div>

      {/* Keyframe animation for pulsing dot */}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export type { VideoUploadStatus };
