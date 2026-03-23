# Changelog

All notable changes to Coworker will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.6.0] - 2026-03-23

### Added
- Side panel UI for issue reporting workflow
- Annotation canvas with drawing, text, selection, and comment tools
- Image placement on canvas via drag-and-drop, clipboard paste, and file picker
- Color picker for annotation tools
- Keyboard shortcuts (D: draw, C: comment, S: select) across all canvas modes
- Browser metadata and Shopify context in issue reports
- Console log capture for debugging context
- Issues panel showing reported issues for the current page
- Studio N.O.P.E. branding with footer links
- GitHub and feature suggestion links in side panel

### Fixed
- Canvas tools visibility in all overlay modes
- Selection color handling across tool switches
- Side panel button state synchronization on overlay dismiss
- Footer visibility across all side panel views

## [0.1.0] - 2025-12-01

### Added
- Initial release: screenshot capture, region selection, GitHub issue creation
- Popup UI with repo selector and inline settings
- Content script for DOM inspection and HTML snippet extraction
- Background service worker for screenshot upload and issue management
- Shadow DOM isolation for content-UI
