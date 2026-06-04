import React from 'react'

interface OptionSelectorProps {
  options: { grammar: boolean; paraphrase: boolean }
  setOptions: React.Dispatch<React.SetStateAction<{ grammar: boolean; paraphrase: boolean }>>
  shouldRevise: boolean
  setShouldRevise: (val: boolean) => void
}

const OptionSelector: React.FC<OptionSelectorProps> = ({ 
  options, 
  setOptions, 
  shouldRevise, 
  setShouldRevise 
}) => {
  return (
    <div className="options-container">
      <div className="option-group">
        <label className="checkbox-label">
          <input 
            type="checkbox" 
            checked={options.grammar} 
            onChange={(e) => setOptions(prev => ({ ...prev, grammar: e.target.checked }))} 
          />
          <span>Check Grammar & Spelling</span>
        </label>
        
        <label className="checkbox-label">
          <input 
            type="checkbox" 
            checked={options.paraphrase} 
            onChange={(e) => setOptions(prev => ({ ...prev, paraphrase: e.target.checked }))} 
          />
          <span>Improve Sentence Structure</span>
        </label>
      </div>

      <div className="revision-toggle">
        <label className="checkbox-label highlight">
          <input 
            type="checkbox" 
            checked={shouldRevise} 
            onChange={(e) => setShouldRevise(e.target.checked)} 
          />
          <span>Generate Revised Version</span>
        </label>
      </div>

      <style>{`
        .options-container {
          display: flex;
          flex-direction: column;
          gap: 15px;
          margin-top: 10px;
        }
        .option-group {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;
        }
        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          font-weight: 500;
        }
        .checkbox-label input {
          width: 18px;
          height: 18px;
        }
        .highlight {
          color: #646cff;
        }
      `}</style>
    </div>
  )
}

export default OptionSelector
