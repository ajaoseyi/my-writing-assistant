import React from 'react'
import { FileCheck } from 'lucide-react'

interface ResultDisplayProps {
  result: string
}

const ResultDisplay: React.FC<ResultDisplayProps> = ({ result }) => {
  // Simple markdown-ish parsing for better display
  const sections = result.split(/(?=Issues Found:|Revised Version:)/i)

  return (
    <div className="result-container">
      <div className="result-header">
        <FileCheck size={24} />
        <h2>Analysis Results</h2>
      </div>
      
      <div className="result-content">
        {sections.map((section, index) => {
          const isHeader = section.toLowerCase().startsWith('issues found:') || 
                          section.toLowerCase().startsWith('revised version:')
          
          return (
            <div key={index} className={`result-section ${isHeader ? 'has-header' : ''}`}>
              <pre>{section.trim()}</pre>
            </div>
          )
        })}
      </div>

      <style>{`
        .result-container {
          background: white;
          padding: 25px;
          border-radius: 12px;
          border: 1px solid #ddd;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }
        .result-header {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #2e7d32;
          margin-bottom: 20px;
          border-bottom: 1px solid #eee;
          padding-bottom: 10px;
        }
        .result-header h2 { margin: 0; }
        .result-content {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .result-section pre {
          white-space: pre-wrap;
          word-wrap: break-word;
          font-family: inherit;
          margin: 0;
          padding: 15px;
          background: #f5f5f5;
          border-radius: 8px;
          line-height: 1.6;
        }
        .has-header pre {
          background: #fff;
          border-left: 4px solid #646cff;
          font-weight: 500;
        }
        @media (prefers-color-scheme: dark) {
          .result-container { background: #1a1a1a; border-color: #333; }
          .result-section pre { background: #242424; color: #eee; }
          .has-header pre { background: #1a1a1a; border-left-color: #646cff; }
          .result-header { color: #81c784; border-bottom-color: #333; }
        }
      `}</style>
    </div>
  )
}

export default ResultDisplay
