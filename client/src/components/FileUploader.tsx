import React, { useRef } from 'react'
import { Upload, FileText, X } from 'lucide-react'

interface FileUploaderProps {
  onFileSelect: (file: File | null) => void
  selectedFile: File | null
}

const FileUploader: React.FC<FileUploaderProps> = ({ onFileSelect, selectedFile }) => {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0])
    }
  }

  const removeFile = () => {
    onFileSelect(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="file-uploader">
      <label>Upload Document (.txt, .md, .pdf, .docx):</label>
      
      {!selectedFile ? (
        <div 
          className="upload-area" 
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={24} />
          <span>Click to select or drag and drop</span>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept=".txt,.md,.pdf,.docx"
            style={{ display: 'none' }}
          />
        </div>
      ) : (
        <div className="selected-file">
          <FileText size={20} />
          <span className="file-name">{selectedFile.name}</span>
          <button onClick={removeFile} className="remove-btn">
            <X size={16} />
          </button>
        </div>
      )}

      <style>{`
        .file-uploader {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .upload-area {
          border: 2px dashed #ccc;
          border-radius: 8px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          transition: border-color 0.2s;
        }
        .upload-area:hover {
          border-color: #646cff;
        }
        .selected-file {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #e3f2fd;
          padding: 10px 15px;
          border-radius: 8px;
          color: #1976d2;
        }
        .file-name {
          flex: 1;
          font-weight: 500;
        }
        .remove-btn {
          background: none;
          border: none;
          padding: 4px;
          color: #d32f2f;
          cursor: pointer;
        }
        @media (prefers-color-scheme: dark) {
          .selected-file { background: #0d47a1; color: white; }
          .remove-btn { color: #ff8a80; }
        }
      `}</style>
    </div>
  )
}

export default FileUploader
