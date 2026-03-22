/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions */
import { useEffect, useState, useCallback, useRef } from 'react';
import type {
  CreateIssueMessage,
  FetchPageIssuesMessage,
  FetchPageIssuesResponse,
  MessageResponse,
  PageIssue,
  Region,
  ShowIssuesPanelMessage,
  ShowScreenshotMessage,
} from '@extension/shared';

type OverlayState = 'idle' | 'selecting' | 'form' | 'submitting' | 'success' | 'error';

interface Toast {
  type: 'success' | 'error';
  message: string;
  issueUrl?: string;
  issueNumber?: number;
}

const annotateScreenshot = (screenshotUrl: string, region: Region, imgRect: DOMRect): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scaleX = img.naturalWidth / imgRect.width;
      const scaleY = img.naturalHeight / imgRect.height;

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0);

      const rx = region.x * scaleX;
      const ry = region.y * scaleY;
      const rw = region.width * scaleX;
      const rh = region.height * scaleY;

      ctx.strokeStyle = '#8B5CF6';
      ctx.lineWidth = 3 * Math.max(scaleX, scaleY);
      ctx.setLineDash([8 * scaleX, 4 * scaleX]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.fillStyle = 'rgba(139, 92, 246, 0.15)';
      ctx.fillRect(rx, ry, rw, rh);

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load screenshot'));
    img.src = screenshotUrl;
  });

const IssuesPanel = ({ issues, open, onClose }: { issues: PageIssue[]; open: boolean; onClose: () => void }) => {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxUrl) {
          setLightboxUrl(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, lightboxUrl, onClose]);

  // Reset lightbox when panel closes
  useEffect(() => {
    if (!open) setLightboxUrl(null);
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        style={panelStyles.backdrop}
        onClick={onClose}
        onKeyDown={e => e.key === 'Escape' && onClose()}
        role="presentation"
      />
      <div style={panelStyles.drawer}>
        <div style={panelStyles.header}>
          <span style={panelStyles.headerTitle}>Issues on this page ({issues.length})</span>
          <button style={panelStyles.closeButton} onClick={onClose} aria-label="Close panel">
            &times;
          </button>
        </div>
        <div style={panelStyles.list}>
          {issues.length === 0 && <div style={panelStyles.empty}>No issues reported for this page</div>}
          {issues.map(issue => {
            const displayTitle = issue.title.replace(/^\[Visual]\s*/, '');
            return (
              <div key={issue.number} style={panelStyles.card}>
                {issue.screenshot_url && (
                  <button
                    type="button"
                    style={{ ...panelStyles.thumbLink, border: 'none', padding: 0, background: 'none' }}
                    onClick={() => setLightboxUrl(issue.screenshot_url!)}>
                    <img src={issue.screenshot_url} alt="Screenshot" style={panelStyles.thumb} />
                  </button>
                )}
                <div style={panelStyles.cardTop}>
                  <span style={panelStyles.cardNumber}>#{issue.number}</span>
                  <span
                    style={{
                      ...panelStyles.cardBadge,
                      background: issue.state === 'open' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(168, 85, 247, 0.12)',
                      color: issue.state === 'open' ? '#4ade80' : '#c084fc',
                    }}>
                    {issue.state}
                  </span>
                  {issue.has_analysis && (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: '8px',
                        background: 'rgba(139, 92, 246, 0.12)',
                        color: '#a78bfa',
                        marginLeft: '4px',
                        letterSpacing: '0.04em',
                      }}>
                      analyzed
                    </span>
                  )}
                </div>
                <div style={panelStyles.cardTitle}>{displayTitle}</div>
                <div style={panelStyles.cardFooter}>
                  <span style={panelStyles.cardDate}>
                    {issue.author && `${issue.author} · `}
                    {new Date(issue.created_at).toLocaleDateString()}
                  </span>
                  <a href={issue.html_url} target="_blank" rel="noopener noreferrer" style={panelStyles.cardLink}>
                    View on GitHub
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {lightboxUrl && (
        <div
          style={panelStyles.lightbox}
          onClick={() => setLightboxUrl(null)}
          onKeyDown={e => e.key === 'Escape' && setLightboxUrl(null)}
          role="presentation">
          <button style={panelStyles.lightboxClose} onClick={() => setLightboxUrl(null)} aria-label="Close image">
            &times;
          </button>
          <img src={lightboxUrl} alt="Screenshot" style={panelStyles.lightboxImg} onClick={e => e.stopPropagation()} />
        </div>
      )}
    </>
  );
};

const App = () => {
  const [state, setState] = useState<OverlayState>('idle');
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [annotatedUrl, setAnnotatedUrl] = useState<string | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [description, setDescription] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [pageUrl, setPageUrl] = useState('');
  const imgRef = useRef<HTMLImageElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isDragging = useRef(false);
  const justFinishedDrag = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragCurrentRef = useRef<{ x: number; y: number } | null>(null);
  const [, forceRender] = useState(0);

  const backdropRef = useRef<HTMLDivElement>(null);
  const [panelIssues, setPanelIssues] = useState<PageIssue[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const lastCreatedIssueRef = useRef<PageIssue | null>(null);

  const dismiss = useCallback(() => {
    setState('idle');
    setScreenshotUrl(null);
    setAnnotatedUrl(null);
    setRegion(null);
    setDescription('');
    setToast(null);
    isDragging.current = false;
    dragStartRef.current = null;
    dragCurrentRef.current = null;
  }, []);

  const resetSelection = useCallback(() => {
    setState('selecting');
    setAnnotatedUrl(null);
    setRegion(null);
    setDescription('');
    isDragging.current = false;
    dragStartRef.current = null;
    dragCurrentRef.current = null;
  }, []);

  useEffect(() => {
    const listener = (message: ShowScreenshotMessage | ShowIssuesPanelMessage) => {
      if (message.type === 'SHOW_SCREENSHOT') {
        setScreenshotUrl(message.payload.screenshotDataUrl);
        setAnnotatedUrl(null);
        setRegion(null);
        setDescription('');
        setToast(null);
        setPageUrl(window.location.href);
        isDragging.current = false;
        dragStartRef.current = null;
        dragCurrentRef.current = null;
        setState('selecting');
      }
      if (message.type === 'SHOW_ISSUES_PANEL') {
        setPanelIssues(message.payload.issues);
        setPanelOpen(true);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Escape via document works when focus is on the host page (selecting/selected states).
  // When focus is inside the Shadow DOM (form/success/error), key events are stopped at
  // the shadow root boundary, so we also handle Escape on the backdrop's onKeyDown.
  useEffect(() => {
    if (state === 'idle') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dismiss();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state, dismiss]);

  // Focus the backdrop when entering success/error so the backdrop's onKeyDown can
  // catch Escape (the document-level listener can't because the Shadow DOM root
  // stops keyboard event propagation).
  useEffect(() => {
    if ((state === 'success' || state === 'error') && backdropRef.current) {
      backdropRef.current.focus();
    }
  }, [state]);

  useEffect(() => {
    if (state === 'form' && textareaRef.current) {
      // Use rAF to ensure the shadow DOM has settled before focusing
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [state]);

  const finishDrag = useCallback(
    async (endX: number, endY: number) => {
      // Flag that a drag just completed so the backdrop click handler won't dismiss
      justFinishedDrag.current = true;
      requestAnimationFrame(() => {
        justFinishedDrag.current = false;
      });

      const start = dragStartRef.current;
      if (!start || !screenshotUrl || !imgRef.current) {
        isDragging.current = false;
        dragStartRef.current = null;
        dragCurrentRef.current = null;
        forceRender(n => n + 1);
        return;
      }

      const x = Math.min(start.x, endX);
      const y = Math.min(start.y, endY);
      const width = Math.abs(endX - start.x);
      const height = Math.abs(endY - start.y);

      isDragging.current = false;
      dragStartRef.current = null;
      dragCurrentRef.current = null;

      if (width < 10 || height < 10) {
        forceRender(n => n + 1);
        return;
      }

      const selectedRegion = { x, y, width, height };
      setRegion(selectedRegion);

      try {
        const imgRect = imgRef.current.getBoundingClientRect();
        const annotated = await annotateScreenshot(screenshotUrl, selectedRegion, imgRect);
        setAnnotatedUrl(annotated);
        setState('form');
      } catch {
        forceRender(n => n + 1);
      }
    },
    [screenshotUrl],
  );

  // Document-level mousemove/mouseup for reliable drag tracking
  useEffect(() => {
    if (state !== 'selecting') return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !imgRef.current) return;
      const rect = imgRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
      dragCurrentRef.current = { x, y };
      forceRender(n => n + 1);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDragging.current || !imgRef.current) return;
      const rect = imgRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
      finishDrag(x, y);
    };

    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('mouseup', handleMouseUp, true);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
    };
  }, [state, finishDrag]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      if (state !== 'selecting') return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      isDragging.current = true;
      dragStartRef.current = pos;
      dragCurrentRef.current = pos;
      forceRender(n => n + 1);
    },
    [state],
  );

  const handleSubmit = useCallback(async () => {
    if (!screenshotUrl || !annotatedUrl || !region || !description.trim()) return;

    setState('submitting');

    try {
      const template = document.querySelector('main')?.getAttribute('data-template') ?? undefined;

      const message: CreateIssueMessage = {
        type: 'CREATE_ISSUE',
        payload: {
          description: description.trim(),
          screenshotDataUrl: screenshotUrl,
          annotatedScreenshotDataUrl: annotatedUrl,
          region,
          pageUrl,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          template,
        },
      };

      const response = await chrome.runtime.sendMessage<CreateIssueMessage, MessageResponse>(message);

      if (response?.success) {
        const desc = description.trim();
        lastCreatedIssueRef.current = {
          number: response.issueNumber!,
          title: `[Visual] ${desc.slice(0, 80)}${desc.length > 80 ? '...' : ''}`,
          state: 'open',
          html_url: response.issueUrl!,
          created_at: new Date().toISOString(),
          description: desc,
          screenshot_url: annotatedUrl ?? undefined,
        };
        setToast({
          type: 'success',
          message: `Created issue #${response.issueNumber}`,
          issueUrl: response.issueUrl,
          issueNumber: response.issueNumber,
        });
        setState('success');
      } else {
        setToast({
          type: 'error',
          message: response?.error ?? 'Failed to create issue',
        });
        setState('error');
      }
    } catch (err) {
      setToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create issue',
      });
      setState('error');
    }
  }, [screenshotUrl, annotatedUrl, region, description, pageUrl]);

  const handleViewAllIssues = useCallback(async () => {
    const url = window.location.href;
    const message: FetchPageIssuesMessage = { type: 'FETCH_PAGE_ISSUES', payload: { pageUrl: url } };
    try {
      const response = await chrome.runtime.sendMessage<FetchPageIssuesMessage, FetchPageIssuesResponse>(message);
      if (response?.success && response.issues) {
        let issues = response.issues;
        // Optimistically include the just-created issue if the API hasn't indexed it yet
        const created = lastCreatedIssueRef.current;
        if (created && !issues.some(i => i.number === created.number)) {
          issues = [created, ...issues];
        }
        dismiss();
        setPanelIssues(issues);
        setPanelOpen(true);
      }
    } catch {
      // Silently fail
    }
  }, [dismiss]);

  const overlayActive = state !== 'idle' && screenshotUrl;

  const dragStart = dragStartRef.current;
  const dragCurrent = dragCurrentRef.current;
  const dragSelection =
    isDragging.current && dragStart && dragCurrent
      ? {
          x: Math.min(dragStart.x, dragCurrent.x),
          y: Math.min(dragStart.y, dragCurrent.y),
          width: Math.abs(dragCurrent.x - dragStart.x),
          height: Math.abs(dragCurrent.y - dragStart.y),
        }
      : null;

  const showScreenshot = state === 'selecting';
  const showForm = state === 'form' || state === 'submitting';
  const showResult = state === 'success' || state === 'error';

  const handleBackdropClick = () => {
    if (state === 'selecting' && !isDragging.current && !justFinishedDrag.current) {
      dismiss();
    }
  };

  return (
    <>
      {overlayActive && (
        <div
          ref={backdropRef}
          tabIndex={-1}
          style={{ ...styles.backdrop, outline: 'none' }}
          onClick={handleBackdropClick}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              dismiss();
            }
            e.stopPropagation();
          }}
          onKeyUp={e => e.stopPropagation()}
          onKeyPress={e => e.stopPropagation()}>
          <button style={styles.closeButton} onClick={dismiss} aria-label="Close overlay">
            &times;
          </button>

          {showScreenshot && (
            <>
              <div style={styles.screenshotContainer} onClick={e => e.stopPropagation()} role="presentation">
                <img
                  ref={imgRef}
                  src={screenshotUrl}
                  alt="Page screenshot"
                  style={{
                    ...styles.screenshot,
                    cursor: 'crosshair',
                  }}
                  draggable={false}
                  onMouseDown={handleMouseDown}
                />

                {dragSelection && dragSelection.width > 0 && dragSelection.height > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: dragSelection.x,
                      top: dragSelection.y,
                      width: dragSelection.width,
                      height: dragSelection.height,
                      border: '2px dashed #8B5CF6',
                      backgroundColor: 'rgba(139, 92, 246, 0.15)',
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </div>

              <div style={styles.pillContainer}>
                <button style={styles.pill} onClick={dismiss}>
                  Cancel · Esc
                </button>
              </div>

              {!isDragging.current && <div style={styles.hint}>Click and drag to select a region</div>}
            </>
          )}

          {(showForm || showResult) && (
            <div style={styles.formPanel} onClick={e => e.stopPropagation()} role="presentation">
              {annotatedUrl && (
                <img src={annotatedUrl} alt="Annotated screenshot" style={styles.formScreenshot} draggable={false} />
              )}

              {showForm && (
                <>
                  <textarea
                    ref={textareaRef}
                    style={styles.textarea}
                    placeholder="Describe the issue..."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        handleSubmit();
                      }
                    }}
                    disabled={state === 'submitting'}
                  />
                  <div style={styles.formActions}>
                    <button style={styles.pill} onClick={resetSelection}>
                      Reselect
                    </button>
                    <button
                      style={{
                        ...styles.pill,
                        background: description.trim()
                          ? 'linear-gradient(135deg, #7c3aed, #9333ea)'
                          : 'rgba(148, 163, 184, 0.12)',
                        border: description.trim()
                          ? '1px solid rgba(139, 92, 246, 0.3)'
                          : '1px solid rgba(148, 163, 184, 0.1)',
                        boxShadow: description.trim() ? '0 4px 16px rgba(139, 92, 246, 0.25)' : 'none',
                        cursor: description.trim() && state !== 'submitting' ? 'pointer' : 'not-allowed',
                        opacity: state === 'submitting' ? 0.7 : 1,
                      }}
                      onClick={handleSubmit}
                      disabled={!description.trim() || state === 'submitting'}>
                      {state === 'submitting' ? 'Submitting...' : 'Submit Issue'}
                    </button>
                  </div>
                  <div style={styles.formHint}>Cmd/Ctrl + Enter to submit</div>
                </>
              )}

              {showResult && toast && (
                <div style={styles.resultContainer}>
                  {toast.type === 'success' ? (
                    <>
                      <div style={styles.successIcon}>&#10003;</div>
                      <div style={styles.resultText}>{toast.message}</div>
                      {toast.issueUrl && (
                        <a href={toast.issueUrl} target="_blank" rel="noopener noreferrer" style={styles.issueLink}>
                          View on GitHub
                        </a>
                      )}
                      <div
                        style={{
                          marginTop: '10px',
                          fontSize: '12px',
                          color: 'rgba(241, 245, 249, 0.35)',
                          textAlign: 'center' as const,
                          fontStyle: 'italic',
                          letterSpacing: '0.02em',
                        }}>
                        Tag @claude on the issue to get an implementation plan.
                      </div>
                      <button
                        style={{
                          ...styles.pill,
                          marginTop: '14px',
                          background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                          border: '1px solid rgba(139, 92, 246, 0.3)',
                          boxShadow: '0 4px 16px rgba(139, 92, 246, 0.25)',
                        }}
                        onClick={handleViewAllIssues}>
                        View all issues
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={styles.errorIcon}>&#10007;</div>
                      <div style={styles.resultText}>{toast.message}</div>
                      <button style={{ ...styles.pill, marginTop: '14px' }} onClick={() => setState('form')}>
                        Retry
                      </button>
                    </>
                  )}
                  <button style={{ ...styles.pill, marginTop: '16px' }} onClick={dismiss}>
                    Close
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <IssuesPanel issues={panelIssues} open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
};

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 999997,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
  },
  closeButton: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    background: 'rgba(15, 23, 42, 0.7)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    color: 'rgba(241, 245, 249, 0.7)',
    border: '1px solid rgba(148, 163, 184, 0.15)',
    borderRadius: '12px',
    width: '40px',
    height: '40px',
    fontSize: '18px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    zIndex: 2,
    transition: 'all 0.2s ease-out',
  },
  screenshotContainer: {
    position: 'relative',
    display: 'inline-block',
    maxWidth: '90vw',
    maxHeight: '85vh',
  },
  screenshot: {
    maxWidth: '90vw',
    maxHeight: '85vh',
    objectFit: 'contain',
    borderRadius: '14px',
    boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
    display: 'block',
    userSelect: 'none',
  },
  pillContainer: {
    position: 'absolute',
    bottom: '80px',
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    zIndex: 2,
    gap: '8px',
  },
  pill: {
    background: 'rgba(15, 23, 42, 0.8)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    color: '#f1f5f9',
    border: '1px solid rgba(148, 163, 184, 0.15)',
    borderRadius: '12px',
    padding: '10px 22px',
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    cursor: 'pointer',
    transition: 'all 0.2s ease-out',
    letterSpacing: '0.01em',
  },
  hint: {
    position: 'absolute',
    top: '24px',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: 'rgba(241, 245, 249, 0.5)',
    fontSize: '13px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    letterSpacing: '0.02em',
    pointerEvents: 'none',
    zIndex: 2,
  },
  formPanel: {
    background: 'rgba(15, 23, 42, 0.85)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    borderRadius: '20px',
    border: '1px solid rgba(148, 163, 184, 0.1)',
    padding: '28px',
    maxWidth: '480px',
    width: '90vw',
    maxHeight: '85vh',
    overflowY: 'auto',
    boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(148, 163, 184, 0.06)',
  },
  formScreenshot: {
    width: '100%',
    borderRadius: '14px',
    marginBottom: '20px',
    display: 'block',
    border: '1px solid rgba(148, 163, 184, 0.06)',
  },
  textarea: {
    width: '100%',
    minHeight: '110px',
    padding: '14px 16px',
    borderRadius: '14px',
    border: '1px solid rgba(148, 163, 184, 0.12)',
    background: 'rgba(0, 0, 0, 0.25)',
    color: '#f1f5f9',
    fontSize: '14px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    lineHeight: 1.6,
    resize: 'vertical',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s ease-out, box-shadow 0.2s ease-out',
  },
  formActions: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '16px',
    gap: '10px',
  },
  formHint: {
    marginTop: '10px',
    fontSize: '12px',
    color: 'rgba(241, 245, 249, 0.3)',
    textAlign: 'right',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    letterSpacing: '0.02em',
  },
  resultContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px 0 8px',
  },
  successIcon: {
    fontSize: '48px',
    color: '#22c55e',
    marginBottom: '16px',
    textShadow: '0 0 24px rgba(34, 197, 94, 0.4)',
  },
  errorIcon: {
    fontSize: '48px',
    color: '#ef4444',
    marginBottom: '16px',
    textShadow: '0 0 24px rgba(239, 68, 68, 0.4)',
  },
  resultText: {
    fontSize: '15px',
    fontWeight: 500,
    color: '#f1f5f9',
    textAlign: 'center',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  issueLink: {
    marginTop: '14px',
    color: '#a78bfa',
    fontSize: '13px',
    fontWeight: 500,
    textDecoration: 'none',
    letterSpacing: '0.01em',
    transition: 'color 0.2s ease-out',
  },
};

const panelStyles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 999995,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
  },
  drawer: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    width: '400px',
    maxWidth: '100vw',
    zIndex: 999996,
    background: 'rgba(15, 23, 42, 0.95)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.4)',
    borderLeft: '1px solid rgba(148, 163, 184, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid rgba(148, 163, 184, 0.08)',
    flexShrink: 0,
  },
  headerTitle: {
    color: '#f1f5f9',
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
  closeButton: {
    background: 'rgba(148, 163, 184, 0.1)',
    border: '1px solid rgba(148, 163, 184, 0.1)',
    borderRadius: '10px',
    color: 'rgba(241, 245, 249, 0.5)',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '4px 10px',
    lineHeight: 1,
    transition: 'all 0.2s ease-out',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  empty: {
    color: 'rgba(241, 245, 249, 0.4)',
    fontSize: '13px',
    textAlign: 'center',
    padding: '32px 0',
    letterSpacing: '0.02em',
  },
  card: {
    background: 'rgba(30, 41, 59, 0.5)',
    borderRadius: '14px',
    padding: '14px',
    border: '1px solid rgba(148, 163, 184, 0.08)',
    transition: 'all 0.2s ease-out',
  },
  thumbLink: {
    display: 'block',
    marginBottom: '10px',
    borderRadius: '10px',
    overflow: 'hidden',
    cursor: 'pointer',
  },
  thumb: {
    width: '100%',
    height: '120px',
    objectFit: 'cover',
    display: 'block',
    borderRadius: '10px',
    border: '1px solid rgba(148, 163, 184, 0.06)',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  cardNumber: {
    color: '#a78bfa',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
  cardBadge: {
    fontSize: '10px',
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  cardTitle: {
    color: '#f1f5f9',
    fontSize: '13px',
    fontWeight: 500,
    marginBottom: '8px',
    lineHeight: 1.4,
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardDate: {
    color: 'rgba(241, 245, 249, 0.3)',
    fontSize: '11px',
    letterSpacing: '0.02em',
  },
  cardLink: {
    color: '#a78bfa',
    fontSize: '11px',
    fontWeight: 500,
    textDecoration: 'none',
    letterSpacing: '0.01em',
  },
  lightbox: {
    position: 'fixed',
    inset: 0,
    zIndex: 999998,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  lightboxClose: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    background: 'rgba(15, 23, 42, 0.7)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    color: 'rgba(241, 245, 249, 0.7)',
    border: '1px solid rgba(148, 163, 184, 0.15)',
    borderRadius: '12px',
    width: '40px',
    height: '40px',
    fontSize: '18px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    transition: 'all 0.2s ease-out',
  },
  lightboxImg: {
    maxWidth: '90vw',
    maxHeight: '90vh',
    objectFit: 'contain',
    borderRadius: '14px',
    boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
    cursor: 'default',
  },
};

export default App;
