import { useRef, useCallback, useState, useEffect } from "react";
import {
  Upload, FileText, X,
  Bold, Italic, Underline, Link2, List, ListOrdered,
  Heading1, Heading2, Quote, AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2, ExternalLink, Loader2,
} from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import ImageExtension from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import UnderlineExtension from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { SAMPLE_TEXT, countWords } from "../App";
import { htmlToText } from "../utils/htmlToText";

export type InputMode = "paste" | "rich" | "upload" | "sample";

export interface DocumentInputProps {
  inputMode: InputMode;
  setInputMode: (m: InputMode) => void;
  content: string;
  setContent: (v: string) => void;
  richHtml: string;
  setRichHtml: (v: string) => void;
  file: File | null;
  setFile: (f: File | null) => void;
  harperCount: number;
  harperLoading: boolean;
  // Google Docs
  richEditorResetKey: number;
  gdocsConnected: boolean;
  gdocsConfigured: boolean;
  gdocsImporting: boolean;
  gdocsCreating: boolean;
  gdocsDocUrl: string | null;
  importedDocTitle: string | null;
  onGdocsConnect: () => void;
  onGdocsImport: (fileId: string) => Promise<void>;
  onCreateGdoc: () => Promise<void>;
  onGdocsDisconnect: () => void;
  gdocsSyncStatus: "idle" | "syncing" | "error";
  gdocsExternalChangeNotice: string | null;
  gdocsSyncErrorMessage?: string | null;
}

// ── Google Docs SVG icon ────────────────────────────────────────────────────
function GDocsIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="#4285F4" />
      <polyline points="14 2 14 8 20 8" fill="#a8c7fa" />
      <line x1="8" y1="13" x2="16" y2="13" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="17" x2="16" y2="17" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="9" x2="10" y2="9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ── Rich text editor ────────────────────────────────────────────────────────
function RichTextEditor({
  onHtmlChange,
  initialContent,
}: {
  onHtmlChange: (html: string) => void;
  initialContent?: string;
}) {
  const onHtmlChangeRef = useRef(onHtmlChange);
  onHtmlChangeRef.current = onHtmlChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2] } }),
      UnderlineExtension,
      LinkExtension.configure({ openOnClick: false }),
      ImageExtension.configure({ inline: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({
        placeholder: "Write your document here — format it however you like, then run the analysis.",
      }),
    ],
    content: initialContent || "",
    onUpdate({ editor }) {
      onHtmlChangeRef.current(editor.getHTML());
    },
    editorProps: { attributes: { class: "rich-editor-content" } },
  });

  // Safety net: explicitly push imported content into the editor after each mount/remount.
  // This handles TipTap v3 edge cases where the `content` init option may not fire
  // reliably after a key-prop remount. Runs once per editor lifecycle, not on every edit.
  useEffect(() => {
    if (editor && initialContent) {
      editor.commands.setContent(initialContent, { emitUpdate: false });
    }
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  const addLink = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Enter URL:");
    if (!url) return;
    if (editor.state.selection.empty) {
      const text = window.prompt("Link text:") || url;
      editor.chain().focus().insertContent(`<a href="${url}">${text}</a>`).run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  if (!editor) return null;

  const btn = (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 26, height: 26, borderRadius: "var(--radius-sm)",
    background: active ? "var(--clr-primary)" : "transparent",
    color: active ? "#fff" : "var(--clr-text-secondary)",
    border: "none", cursor: "pointer", flexShrink: 0,
  });
  const sep: React.CSSProperties = {
    width: 1, height: 16, background: "var(--clr-border)", margin: "0 3px", flexShrink: 0,
  };

  return (
    <div className="rich-editor-wrapper">
      <div className="rich-editor-toolbar">
        <button style={btn(editor.isActive("bold"))} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }} title="Bold"><Bold size={13} /></button>
        <button style={btn(editor.isActive("italic"))} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }} title="Italic"><Italic size={13} /></button>
        <button style={btn(editor.isActive("underline"))} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }} title="Underline"><Underline size={13} /></button>

        <div style={sep} />

        <button style={btn(editor.isActive("heading", { level: 1 }))} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 1 }).run(); }} title="Heading 1"><Heading1 size={14} /></button>
        <button style={btn(editor.isActive("heading", { level: 2 }))} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 2 }).run(); }} title="Heading 2"><Heading2 size={14} /></button>

        <div style={sep} />

        <button style={btn(editor.isActive("bulletList"))} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }} title="Bullet list"><List size={13} /></button>
        <button style={btn(editor.isActive("orderedList"))} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run(); }} title="Ordered list"><ListOrdered size={13} /></button>

        <div style={sep} />

        <button style={btn(editor.isActive("link"))} onMouseDown={(e) => { e.preventDefault(); addLink(); }} title="Insert link"><Link2 size={13} /></button>
        <button style={btn(editor.isActive("blockquote"))} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBlockquote().run(); }} title="Blockquote"><Quote size={13} /></button>

        <div style={sep} />

        <button style={btn(editor.isActive({ textAlign: "left" }))} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setTextAlign("left").run(); }} title="Align left"><AlignLeft size={13} /></button>
        <button style={btn(editor.isActive({ textAlign: "center" }))} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setTextAlign("center").run(); }} title="Align center"><AlignCenter size={13} /></button>
        <button style={btn(editor.isActive({ textAlign: "right" }))} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setTextAlign("right").run(); }} title="Align right"><AlignRight size={13} /></button>

        <div style={sep} />

        <button style={btn(false)} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().undo().run(); }} title="Undo"><Undo2 size={13} /></button>
        <button style={btn(false)} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().redo().run(); }} title="Redo"><Redo2 size={13} /></button>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}

// ── Google Docs banner (sits above the editor in the Write tab) ─────────────
function GDocsBanner({
  configured,
  connected,
  importing,
  creating,
  docUrl,
  docTitle,
  onConnect,
  onImport,
  onCreate,
  onDisconnect,
  syncStatus,
  externalChangeNotice,
  syncErrorMessage,
}: {
  configured: boolean;
  connected: boolean;
  importing: boolean;
  creating: boolean;
  docUrl: string | null;
  docTitle: string | null;
  onConnect: () => void;
  onImport: (fileId: string) => Promise<void>;
  onCreate: () => Promise<void>;
  onDisconnect: () => void;
  syncStatus: "idle" | "syncing" | "error";
  externalChangeNotice: string | null;
  syncErrorMessage?: string | null;
}) {
  const [showImport, setShowImport] = useState(false);
  const [docInput, setDocInput] = useState("");
  const [importError, setImportError] = useState("");
  const [lastDoc] = useState<{ docId: string; title: string } | null>(() => {
    try {
      const raw = localStorage.getItem("gdocs_last_doc");
      return raw ? (JSON.parse(raw) as { docId: string; title: string }) : null;
    } catch { return null; }
  });

  const extractFileId = (input: string): string | null => {
    // Accept bare file ID or full Google Docs URL
    const urlMatch = input.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) return urlMatch[1];
    // Accept a bare ID (alphanumeric + dashes/underscores, 10+ chars)
    if (/^[a-zA-Z0-9_-]{10,}$/.test(input.trim())) return input.trim();
    return null;
  };

  const handleImportSubmit = async () => {
    const fileId = extractFileId(docInput);
    if (!fileId) {
      setImportError("Paste a Google Docs URL or document ID.");
      return;
    }
    setImportError("");
    try {
      await onImport(fileId);
      setShowImport(false);
      setDocInput("");
    } catch {
      setImportError("Could not import document. Check the URL and try again.");
    }
  };

  return (
    <div className="gdocs-banner-wrap">
      <div className="gdocs-banner">
        <div className="gdocs-banner-left">
          <div className="gdocs-banner-icon"><GDocsIcon size={17} /></div>
          <div>
            <div className="gdocs-banner-title">Sync with Google Docs</div>
            <div className="gdocs-banner-desc">
              {connected
                ? docTitle
                  ? `Linked to "${docTitle}" — edits sync both ways.`
                  : "Connected — import a doc or create a new one."
                : "Edits here and in Google Docs stay in sync — both ways."}
            </div>
          </div>
          {connected && docTitle && (
            <span
              className={`gdocs-sync-pill${
                syncStatus === "syncing" ? " syncing" :
                syncStatus === "error" ? " error" :
                " ok"
              }`}
            >
              {syncStatus === "syncing" ? "Syncing…" : syncStatus === "error" ? "Sync error" : "Live"}
            </span>
          )}
        </div>

        <div className="gdocs-banner-actions">
          {!configured ? (
            <span className="gdocs-not-configured">Add GOOGLE_CLIENT_ID to enable</span>
          ) : !connected ? (
            <button className="gdocs-btn-outline" onClick={onConnect}>
              Connect Google
            </button>
          ) : (
            <>
              <button
                className="gdocs-btn-outline"
                onClick={() => setShowImport((v) => !v)}
                disabled={importing}
              >
                {importing ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : null}
                Import a doc
              </button>
              <button
                className="gdocs-btn-filled"
                onClick={onCreate}
                disabled={creating}
              >
                {creating
                  ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Creating…</>
                  : docUrl
                  ? <><ExternalLink size={13} /> Open in Docs</>
                  : "Create Google Doc"}
              </button>
              {docUrl && !creating && (
                <a
                  className="gdocs-btn-outline"
                  href={docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 5, textDecoration: "none" }}
                >
                  <ExternalLink size={12} /> Open
                </a>
              )}
              <button
                className="gdocs-btn-ghost"
                onClick={onDisconnect}
                title="Disconnect Google account"
              >
                Log out
              </button>
            </>
          )}
        </div>
      </div>

      {connected && !docTitle && lastDoc && (
        <div className="gdocs-last-session-strip">
          <span>Last session: <strong>"{lastDoc.title}"</strong></span>
          <button
            className="gdocs-btn-filled"
            onClick={() => onImport(lastDoc.docId)}
            disabled={importing}
          >
            {importing
              ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
              : "Resume this doc"}
          </button>
        </div>
      )}

      {externalChangeNotice && (
        <div className="gdocs-external-change-notice">{externalChangeNotice}</div>
      )}

      {syncErrorMessage && (
        <div className="gdocs-sync-error-notice">{syncErrorMessage}</div>
      )}

      {showImport && connected && (
        <div className="gdocs-import-panel">
          <input
            className="gdocs-import-input"
            type="text"
            placeholder="Paste a Google Docs URL or file ID…"
            value={docInput}
            onChange={(e) => { setDocInput(e.target.value); setImportError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleImportSubmit()}
            autoFocus
          />
          <button
            className="gdocs-btn-filled"
            onClick={handleImportSubmit}
            disabled={importing || !docInput.trim()}
          >
            {importing ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : null}
            Import
          </button>
          <button className="gdocs-btn-ghost" onClick={() => { setShowImport(false); setImportError(""); }}>
            Cancel
          </button>
          {importError && <span className="gdocs-import-error">{importError}</span>}
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function DocumentInput({
  inputMode, setInputMode,
  content, setContent,
  richHtml, setRichHtml,
  file, setFile,
  harperCount, harperLoading,
  richEditorResetKey,
  gdocsConnected, gdocsConfigured,
  gdocsImporting, gdocsCreating,
  gdocsDocUrl, importedDocTitle,
  onGdocsConnect, onGdocsImport, onCreateGdoc, onGdocsDisconnect,
  gdocsSyncStatus, gdocsExternalChangeNotice, gdocsSyncErrorMessage,
}: DocumentInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayText =
    inputMode === "sample" ? SAMPLE_TEXT :
    inputMode === "rich" ? htmlToText(richHtml) :
    content;
  const wordCount = countWords(displayText);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setFile(e.target.files[0]);
  };

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const switchTab = (mode: InputMode) => {
    if (mode === "paste" && inputMode === "rich" && richHtml) {
      setContent(htmlToText(richHtml));
    }
    setInputMode(mode);
    if (mode === "sample") setContent("");
  };

  const TAB_LABELS: Record<InputMode, string> = {
    paste: "Paste text",
    upload: "Upload file",
    rich: "Write",
    sample: "Try a sample",
  };

  return (
    <div className="doc-input-panel">
      {/* Tab bar */}
      <div className="doc-input-tabs">
        {(["paste", "upload", "rich", "sample"] as InputMode[]).map((m) => (
          <button
            key={m}
            className={`doc-tab-btn${inputMode === m ? " active" : ""}`}
            onClick={() => switchTab(m)}
          >
            {TAB_LABELS[m]}
          </button>
        ))}
        <span className="doc-input-wordcount">
          {inputMode !== "upload" ? `${wordCount} word${wordCount !== 1 ? "s" : ""}` : ""}
        </span>
      </div>

      {/* Body */}
      <div className="doc-input-body">
        {inputMode === "paste" && (
          <>
            <textarea
              className="doc-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste your text here…"
              rows={11}
            />
            {(harperLoading || harperCount > 0) && (
              <div className="harper-live-badge">
                {harperLoading
                  ? <span className="harper-badge-checking">Checking…</span>
                  : <span className="harper-badge-issues">
                      <span className="harper-badge-dot" />
                      {harperCount} grammar issue{harperCount !== 1 ? "s" : ""} detected
                    </span>
                }
              </div>
            )}
          </>
        )}

        {inputMode === "rich" && (
          <>
            <GDocsBanner
              configured={gdocsConfigured}
              connected={gdocsConnected}
              importing={gdocsImporting}
              creating={gdocsCreating}
              docUrl={gdocsDocUrl}
              docTitle={importedDocTitle}
              onConnect={onGdocsConnect}
              onImport={onGdocsImport}
              onCreate={onCreateGdoc}
              onDisconnect={onGdocsDisconnect}
              syncStatus={gdocsSyncStatus}
              externalChangeNotice={gdocsExternalChangeNotice}
              syncErrorMessage={gdocsSyncErrorMessage}
            />
            <RichTextEditor
              key={`editor-${richEditorResetKey}`}
              onHtmlChange={setRichHtml}
              initialContent={richHtml || undefined}
            />
          </>
        )}

        {inputMode === "upload" && (
          <>
            {file ? (
              <div className="upload-selected-file">
                <FileText size={16} />
                <span className="upload-selected-name">{file.name}</span>
                <button className="upload-remove-btn" onClick={removeFile} title="Remove file">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="upload-drop-area" onClick={() => fileInputRef.current?.click()}>
                <Upload size={28} className="upload-drop-icon" />
                <span className="upload-drop-label">Click to select or drag and drop</span>
                <span className="upload-drop-sub">.txt, .md, .pdf, .docx files up to 2 MB</span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.pdf,.docx"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          </>
        )}

        {inputMode === "sample" && (
          <p className="doc-sample-text">{SAMPLE_TEXT}</p>
        )}
      </div>
    </div>
  );
}
