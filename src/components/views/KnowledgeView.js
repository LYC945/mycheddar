import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

const { ipcRenderer } = window.require('electron');

export class KnowledgeView extends LitElement {
    static styles = css`
        * {
            box-sizing: border-box;
            font-family: 'Inter', sans-serif;
        }

        :host {
            display: block;
            height: 100%;
        }

        .container {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 4px 0;
            height: 100%;
        }

        .description {
            font-size: 12px;
            color: var(--text-secondary, #888);
            line-height: 1.5;
        }

        .folder-path {
            font-size: 11px;
            color: var(--text-secondary, #888);
            font-family: 'Monaco', 'Menlo', monospace;
            background: var(--input-background, rgba(0,0,0,0.3));
            padding: 6px 10px;
            border-radius: 6px;
            word-break: break-all;
        }

        .actions {
            display: flex;
            gap: 8px;
        }

        .action-btn {
            background: var(--button-background, rgba(255,255,255,0.05));
            color: var(--text-color, #ccc);
            border: 1px solid var(--border-color, #333);
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: background 0.2s;
        }

        .action-btn:hover {
            background: var(--hover-background, rgba(255,255,255,0.1));
        }

        .upload-area {
            border: 1.5px dashed var(--border-color, #444);
            border-radius: 8px;
            padding: 16px;
            text-align: center;
            cursor: pointer;
            transition: border-color 0.2s, background 0.2s;
        }

        .upload-area:hover {
            border-color: var(--accent-color, #666);
            background: var(--hover-background, rgba(255,255,255,0.05));
        }

        .upload-area.dragover {
            border-color: #4a9eff;
            background: rgba(74, 158, 255, 0.08);
        }

        .upload-label {
            font-size: 12px;
            color: var(--text-color, #ccc);
        }

        .upload-hint {
            font-size: 11px;
            color: var(--text-secondary, #888);
            margin-top: 4px;
        }

        .files-header {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-secondary, #888);
        }

        .files-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
            flex: 1;
            overflow-y: auto;
        }

        .file-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 6px 10px;
            background: var(--button-background, rgba(255,255,255,0.05));
            border: 1px solid var(--border-color, #333);
            border-radius: 6px;
        }

        .file-item.prompt-file {
            border-color: rgba(74, 158, 255, 0.3);
            background: rgba(74, 158, 255, 0.05);
        }

        .file-icon {
            font-size: 14px;
            flex-shrink: 0;
        }

        .file-info {
            flex: 1;
            min-width: 0;
        }

        .file-name {
            font-size: 12px;
            font-weight: 500;
            color: var(--text-color, #ccc);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .file-meta {
            font-size: 10px;
            color: var(--text-secondary, #888);
        }

        .file-tag {
            font-size: 9px;
            background: rgba(74, 158, 255, 0.2);
            color: #4a9eff;
            padding: 1px 6px;
            border-radius: 3px;
            font-weight: 600;
        }

        .delete-btn {
            background: none;
            border: none;
            color: var(--text-secondary, #888);
            cursor: pointer;
            padding: 2px 4px;
            border-radius: 4px;
            font-size: 14px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            opacity: 0.6;
            transition: opacity 0.2s, color 0.2s;
        }

        .delete-btn:hover {
            opacity: 1;
            color: #ff6b6b;
        }

        .empty-state {
            text-align: center;
            padding: 12px;
            color: var(--text-secondary, #888);
            font-size: 12px;
        }

        .status-msg {
            font-size: 11px;
            text-align: center;
            padding: 4px;
            border-radius: 4px;
        }

        .status-msg.error { color: #ff6b6b; }
        .status-msg.success { color: #6bcb77; }

        input[type="file"] {
            display: none;
        }
    `;

    static properties = {
        files: { type: Array },
        folderPath: { type: String },
        statusMsg: { type: String },
        statusType: { type: String },
    };

    constructor() {
        super();
        this.files = [];
        this.folderPath = '';
        this.statusMsg = '';
        this.statusType = '';
    }

    connectedCallback() {
        super.connectedCallback();
        this._loadFiles();
    }

    async _loadFiles() {
        const result = await ipcRenderer.invoke('get-knowledge-files');
        if (result.success) {
            this.files = result.files;
            this.folderPath = result.folder;
        }
    }

    _getFileIcon(file) {
        if (file.isPrompt) return '📋';
        const mt = file.mimeType || '';
        if (mt.startsWith('image/')) return '🖼️';
        if (mt === 'application/pdf') return '📕';
        if (mt.startsWith('text/')) return '📝';
        return '📄';
    }

    _formatSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    async _openFolder() {
        await ipcRenderer.invoke('open-knowledge-folder');
    }

    async _refreshFiles() {
        await this._loadFiles();
        this.statusMsg = 'Refreshed';
        this.statusType = 'success';
        this.requestUpdate();
        setTimeout(() => { this.statusMsg = ''; this.requestUpdate(); }, 2000);
    }

    async _deleteFile(fileName) {
        if (fileName === 'prompt.txt') return; // Don't allow deleting prompt
        const result = await ipcRenderer.invoke('delete-knowledge-file', fileName);
        if (result.success) {
            await this._loadFiles();
        }
    }

    async _handleFiles(fileList) {
        for (const file of fileList) {
            const arrayBuffer = await file.arrayBuffer();
            const result = await ipcRenderer.invoke('save-knowledge-file', {
                buffer: Array.from(new Uint8Array(arrayBuffer)),
                fileName: file.name,
            });

            if (result.success) {
                this.statusMsg = `${file.name} added`;
                this.statusType = 'success';
            } else {
                this.statusMsg = `Error: ${result.error}`;
                this.statusType = 'error';
            }
            this.requestUpdate();
        }

        await this._loadFiles();
        setTimeout(() => { this.statusMsg = ''; this.requestUpdate(); }, 3000);
    }

    _onFileInputChange(e) {
        if (e.target.files?.length > 0) this._handleFiles(e.target.files);
        e.target.value = '';
    }

    _onDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('dragover');
    }

    _onDragLeave(e) {
        e.currentTarget.classList.remove('dragover');
    }

    _onDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');
        if (e.dataTransfer.files?.length > 0) this._handleFiles(e.dataTransfer.files);
    }

    _onUploadClick() {
        this.shadowRoot.querySelector('#fileInput').click();
    }

    render() {
        const contextFiles = this.files.filter(f => !f.isPrompt);
        const promptFile = this.files.find(f => f.isPrompt);

        return html`
            <div class="container">
                <div class="description">
                    All files in the knowledge folder are sent as context with every Ctrl+0 analysis.
                    Edit <b>prompt.txt</b> to customize the prompt.
                </div>

                <div class="folder-path">${this.folderPath}</div>

                <div class="actions">
                    <button class="action-btn" @click=${this._openFolder}>
                        📂 Open Folder
                    </button>
                    <button class="action-btn" @click=${this._refreshFiles}>
                        🔄 Refresh
                    </button>
                </div>

                <div
                    class="upload-area"
                    @click=${this._onUploadClick}
                    @dragover=${this._onDragOver}
                    @dragleave=${this._onDragLeave}
                    @drop=${this._onDrop}
                >
                    <div class="upload-label">Click or drag files to add to knowledge folder</div>
                    <div class="upload-hint">PDF, images, text, code files</div>
                    <input
                        id="fileInput"
                        type="file"
                        multiple
                        @change=${this._onFileInputChange}
                    />
                </div>

                ${this.statusMsg
                    ? html`<div class="status-msg ${this.statusType}">${this.statusMsg}</div>`
                    : ''}

                <div class="files-header">Files (${this.files.length})</div>

                <div class="files-list">
                    ${promptFile ? html`
                        <div class="file-item prompt-file">
                            <span class="file-icon">📋</span>
                            <div class="file-info">
                                <div class="file-name">prompt.txt</div>
                                <div class="file-meta">${this._formatSize(promptFile.size)}</div>
                            </div>
                            <span class="file-tag">PROMPT</span>
                        </div>
                    ` : ''}

                    ${contextFiles.length === 0
                        ? html`<div class="empty-state">No context files yet — add files or drop them here</div>`
                        : contextFiles.map(file => html`
                            <div class="file-item">
                                <span class="file-icon">${this._getFileIcon(file)}</span>
                                <div class="file-info">
                                    <div class="file-name">${file.name}</div>
                                    <div class="file-meta">${this._formatSize(file.size)}</div>
                                </div>
                                <button
                                    class="delete-btn"
                                    @click=${() => this._deleteFile(file.name)}
                                    title="Remove file"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                                        <path d="M18 6L6 18M6 6l12 12"/>
                                    </svg>
                                </button>
                            </div>
                        `)}
                </div>
            </div>
        `;
    }
}

customElements.define('knowledge-view', KnowledgeView);
