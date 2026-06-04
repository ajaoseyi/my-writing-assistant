import { useRef } from "react";
import { Upload, FileText, X } from "lucide-react";
import { SAMPLE_TEXT, countWords } from "../App";

type InputMode = "paste" | "upload" | "sample";

interface DocumentInputProps {
  inputMode: InputMode;
  setInputMode: (m: InputMode) => void;
  content: string;
  setContent: (v: string) => void;
  file: File | null;
  setFile: (f: File | null) => void;
}

export default function DocumentInput({
  inputMode,
  setInputMode,
  content,
  setContent,
  file,
  setFile,
}: DocumentInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayText = inputMode === "sample" ? SAMPLE_TEXT : content;
  const wordCount = countWords(displayText);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const switchTab = (mode: InputMode) => {
    setInputMode(mode);
    if (mode === "sample") setContent("");
  };

  return (
    <div className="doc-input-panel">
      {/* Tab bar */}
      <div className="doc-input-tabs">
        {(["paste", "upload", "sample"] as InputMode[]).map((m) => (
          <button
            key={m}
            className={`doc-tab-btn${inputMode === m ? " active" : ""}`}
            onClick={() => switchTab(m)}
          >
            {m === "paste" ? "Paste text" : m === "upload" ? "Upload file" : "Try a sample"}
          </button>
        ))}
        <span className="doc-input-wordcount">
          {inputMode !== "upload" ? `${wordCount} word${wordCount !== 1 ? "s" : ""}` : ""}
        </span>
      </div>

      {/* Body */}
      <div className="doc-input-body">
        {inputMode === "paste" && (
          <textarea
            className="doc-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste your text here…"
            rows={11}
          />
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
              <div
                className="upload-drop-area"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={28} className="upload-drop-icon" />
                <span className="upload-drop-label">Click to select or drag and drop</span>
                <span className="upload-drop-sub">.txt files up to 2 MB</span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md"
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
