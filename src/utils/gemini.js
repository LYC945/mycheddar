const { GoogleGenAI } = require('@google/genai');
const { BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Knowledge folder path
const KNOWLEDGE_DIR = path.join(os.homedir(), 'cheddar', 'knowledge');
const PROMPT_FILE = path.join(KNOWLEDGE_DIR, 'prompt.txt');

const DEFAULT_PROMPT = '针对question，给出简短正确的回答，答案包含英文。';

// Ensure knowledge folder and default prompt exist
function ensureKnowledgeDir() {
    if (!fs.existsSync(KNOWLEDGE_DIR)) {
        fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
        console.log('Created knowledge folder:', KNOWLEDGE_DIR);
    }
    if (!fs.existsSync(PROMPT_FILE)) {
        fs.writeFileSync(PROMPT_FILE, DEFAULT_PROMPT, 'utf-8');
        console.log('Created default prompt.txt');
    }
}

// Read the prompt from prompt.txt
function getPrompt() {
    try {
        if (fs.existsSync(PROMPT_FILE)) {
            const prompt = fs.readFileSync(PROMPT_FILE, 'utf-8').trim();
            return prompt || DEFAULT_PROMPT;
        }
    } catch (err) {
        console.error('Error reading prompt.txt:', err.message);
    }
    return DEFAULT_PROMPT;
}

// Get MIME type from file extension
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
        '.txt': 'text/plain',
        '.md': 'text/markdown',
        '.js': 'text/javascript',
        '.ts': 'text/plain',
        '.py': 'text/x-python',
        '.json': 'application/json',
        '.csv': 'text/csv',
        '.xml': 'text/xml',
        '.html': 'text/html',
        '.css': 'text/css',
        '.java': 'text/x-java',
        '.c': 'text/x-c',
        '.cpp': 'text/x-c++',
        '.h': 'text/x-c',
        '.rb': 'text/x-ruby',
        '.go': 'text/x-go',
        '.rs': 'text/x-rust',
        '.sh': 'text/x-shellscript',
        '.sql': 'text/x-sql',
        '.yaml': 'text/yaml',
        '.yml': 'text/yaml',
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    return mimeMap[ext] || 'application/octet-stream';
}

// Check if file is a text file
function isTextFile(mimeType) {
    return mimeType.startsWith('text/') || mimeType === 'application/json';
}

// Read all knowledge files from folder and build parts
function buildKnowledgeParts() {
    const parts = [];
    ensureKnowledgeDir();

    try {
        const files = fs.readdirSync(KNOWLEDGE_DIR);
        for (const fileName of files) {
            // Skip prompt.txt — it's used as the prompt, not context
            if (fileName === 'prompt.txt') continue;

            const filePath = path.join(KNOWLEDGE_DIR, fileName);
            const stat = fs.statSync(filePath);
            if (!stat.isFile()) continue;

            const mimeType = getMimeType(filePath);

            if (isTextFile(mimeType)) {
                // Text files: read content and include as text
                const content = fs.readFileSync(filePath, 'utf-8');
                parts.push({ text: `[File: ${fileName}]\n${content}` });
                console.log(`Knowledge: loaded text file "${fileName}" (${content.length} chars)`);
            } else if (mimeType !== 'application/octet-stream') {
                // Binary files (PDF, images): read as base64 inline data
                const buffer = fs.readFileSync(filePath);
                const base64 = buffer.toString('base64');
                parts.push({ inlineData: { data: base64, mimeType } });
                console.log(`Knowledge: loaded binary file "${fileName}" (${buffer.length} bytes)`);
            }
        }
    } catch (err) {
        console.error('Error reading knowledge folder:', err.message);
    }

    return parts;
}

// List files in knowledge folder
function listKnowledgeFiles() {
    ensureKnowledgeDir();
    try {
        const files = fs.readdirSync(KNOWLEDGE_DIR);
        return files
            .filter(f => {
                const filePath = path.join(KNOWLEDGE_DIR, f);
                return fs.statSync(filePath).isFile();
            })
            .map(f => {
                const filePath = path.join(KNOWLEDGE_DIR, f);
                const stat = fs.statSync(filePath);
                return {
                    name: f,
                    size: stat.size,
                    mimeType: getMimeType(filePath),
                    isPrompt: f === 'prompt.txt',
                    modifiedAt: stat.mtimeMs,
                };
            });
    } catch (err) {
        console.error('Error listing knowledge files:', err.message);
        return [];
    }
}

// Conversation tracking
let currentSessionId = null;
let conversationHistory = [];

function sendToRenderer(channel, data) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
        windows[0].webContents.send(channel, data);
    }
}

function initializeNewSession() {
    currentSessionId = Date.now().toString();
    conversationHistory = [];
}

function saveConversationTurn(question, aiResponse) {
    if (!currentSessionId) initializeNewSession();

    const turn = {
        timestamp: Date.now(),
        transcription: question.trim(),
        ai_response: aiResponse.trim(),
    };
    conversationHistory.push(turn);

    sendToRenderer('save-conversation-turn', {
        sessionId: currentSessionId,
        turn,
        fullHistory: conversationHistory,
    });
}

function getCurrentSessionData() {
    return { sessionId: currentSessionId, history: conversationHistory };
}

async function getStoredSetting(key, defaultValue) {
    try {
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const value = await windows[0].webContents.executeJavaScript(`
                (function() {
                    try {
                        if (typeof localStorage === 'undefined') return '${defaultValue}';
                        return localStorage.getItem('${key}') || '${defaultValue}';
                    } catch (e) { return '${defaultValue}'; }
                })()
            `);
            return value;
        }
    } catch (error) {
        console.error('Error getting stored setting:', error.message);
    }
    return defaultValue;
}

async function captureScreen() {
    const { desktopCapturer } = require('electron');
    const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 },
    });
    if (!sources || sources.length === 0) throw new Error('No screen sources available');
    return sources[0].thumbnail.toJPEG(85).toString('base64');
}

// Build full parts: knowledge files + screenshot + prompt
function buildParts(base64Image, promptText) {
    const parts = [];

    // 1. Knowledge context from folder
    const knowledgeParts = buildKnowledgeParts();
    parts.push(...knowledgeParts);

    // 2. Screenshot
    parts.push({ inlineData: { data: base64Image, mimeType: 'image/jpeg' } });

    // 3. Prompt
    parts.push({ text: promptText });

    return parts;
}

function setupGeminiIpcHandlers() {
    // Initialize knowledge folder on startup
    ensureKnowledgeDir();

    // Capture screen and analyze (Ctrl+0)
    ipcMain.handle('capture-and-analyze', async event => {
        console.log('IPC: capture-and-analyze');
        const apiKey = await getStoredSetting('apiKey', '');
        if (!apiKey) return { success: false, error: 'No API key configured' };

        try {
            sendToRenderer('update-status', 'Capturing screen...');
            const base64Image = await captureScreen();
            console.log('Screen captured, size:', base64Image.length);

            const prompt = getPrompt();
            const client = new GoogleGenAI({ vertexai: false, apiKey });
            const parts = buildParts(base64Image, prompt);

            sendToRenderer('update-status', 'Analyzing...');
            const response = await client.models.generateContent({
                model: 'gemini-3.1-pro-preview',
                contents: [{ role: 'user', parts }],
            });

            const text = response.text;
            console.log('Response length:', text.length);
            sendToRenderer('update-response', text);
            sendToRenderer('update-status', 'Done');
            saveConversationTurn('[Screen Capture]', text);

            return { success: true, text };
        } catch (error) {
            console.error('Error in capture-and-analyze:', error);
            sendToRenderer('update-status', 'Error: ' + error.message);
            return { success: false, error: error.message };
        }
    });

    // Capture screen + user text
    ipcMain.handle('capture-and-analyze-with-text', async (event, userText) => {
        console.log('IPC: capture-and-analyze-with-text:', userText);
        const apiKey = await getStoredSetting('apiKey', '');
        if (!apiKey) return { success: false, error: 'No API key configured' };

        try {
            sendToRenderer('update-status', 'Capturing screen...');
            const base64Image = await captureScreen();

            const basePrompt = getPrompt();
            const prompt = `${basePrompt}\n\nUser question: ${userText}`;
            const client = new GoogleGenAI({ vertexai: false, apiKey });
            const parts = buildParts(base64Image, prompt);

            sendToRenderer('update-status', 'Analyzing...');
            const response = await client.models.generateContent({
                model: 'gemini-3.1-pro-preview',
                contents: [{ role: 'user', parts }],
            });

            const text = response.text;
            sendToRenderer('update-response', text);
            sendToRenderer('update-status', 'Done');
            saveConversationTurn(userText, text);

            return { success: true, text };
        } catch (error) {
            console.error('Error:', error);
            sendToRenderer('update-status', 'Error: ' + error.message);
            return { success: false, error: error.message };
        }
    });

    // Knowledge folder management
    ipcMain.handle('get-knowledge-files', async () => {
        return { success: true, files: listKnowledgeFiles(), folder: KNOWLEDGE_DIR };
    });

    ipcMain.handle('open-knowledge-folder', async () => {
        ensureKnowledgeDir();
        shell.openPath(KNOWLEDGE_DIR);
        return { success: true };
    });

    ipcMain.handle('delete-knowledge-file', async (event, fileName) => {
        try {
            const filePath = path.join(KNOWLEDGE_DIR, fileName);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('save-knowledge-file', async (event, { buffer, fileName }) => {
        try {
            ensureKnowledgeDir();
            const filePath = path.join(KNOWLEDGE_DIR, fileName);
            fs.writeFileSync(filePath, Buffer.from(buffer));
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Conversation history
    ipcMain.handle('get-current-session', async () => {
        return { success: true, data: getCurrentSessionData() };
    });

    ipcMain.handle('start-new-session', async () => {
        initializeNewSession();
        return { success: true, sessionId: currentSessionId };
    });

    ipcMain.handle('update-google-search-setting', async (event, enabled) => {
        return { success: true };
    });
}

// Standalone function for global shortcut (Ctrl+0)
async function captureAndAnalyze() {
    console.log('captureAndAnalyze triggered');
    const apiKey = await getStoredSetting('apiKey', '');
    if (!apiKey) {
        sendToRenderer('update-status', 'No API key configured');
        return;
    }

    try {
        sendToRenderer('update-status', 'Capturing screen...');
        const base64Image = await captureScreen();
        console.log('Screen captured, size:', base64Image.length);

        const prompt = getPrompt();
        const client = new GoogleGenAI({ vertexai: false, apiKey });
        const parts = buildParts(base64Image, prompt);

        sendToRenderer('update-status', 'Analyzing...');
        const response = await client.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: [{ role: 'user', parts }],
        });

        const text = response.text;
        console.log('Response length:', text.length);
        sendToRenderer('update-response', text);
        sendToRenderer('update-status', 'Done');
        saveConversationTurn('[Screen Capture]', text);
    } catch (error) {
        console.error('Error in captureAndAnalyze:', error);
        sendToRenderer('update-status', 'Error: ' + error.message);
    }
}

module.exports = {
    sendToRenderer,
    setupGeminiIpcHandlers,
    captureAndAnalyze,
    getStoredSetting,
};
