import { useState } from 'react';
import { saveVocabulary } from '../utils/graphql';


function DefinitionPopup({
  selectedText,
  videoTitle,
  surroundingText,
  sourceVideoUrl,
  userId,
  onClose,
  onSaved,
}) {
  const [saveStatus, setSaveStatus] = useState(''); // 'success', 'error', or ''

  const handleSave = async () => {
    setSaveStatus('saving');

    try {
      // Prepare vocabulary data for GraphQL mutation
      const vocabularyData = {
        text: selectedText.selectedWord || '', // The word/phrase user selected
        definition: selectedText.definition || '',
        example: selectedText.example_sentence || '',
        exampleTrans: selectedText.example_translation || '',
        realLifeDef: selectedText.readLife_usage || '',
        surroundingText: surroundingText || '',
        videoTitle: videoTitle || '',
        sourceVideoUrl: sourceVideoUrl || null,
        userId,
      };

      const result = await saveVocabulary(vocabularyData);

      console.log('Saved vocabulary:', result);
      setSaveStatus('success');
      onSaved?.();

      // // Auto-hide success message after 2 seconds
      // setTimeout(() => setSaveStatus(''), 2000);
    } catch (error) {
      console.error('Failed to save vocabulary:', error);
      setSaveStatus('error');

      // Auto-hide error message after 3 seconds
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  return (
    <div className="trans-definition">
      <div className="definition-popup-header">
        <button
          type="button"
          className="settings-close definition-popup-close"
          onClick={onClose}
          aria-label="Close definition"
        >
          ×
        </button>
      </div>
      <div className="definition">
        <span>
          {selectedText.definition}
        </span>
      </div>
      <div className="realLife-definition">
          <div className="border">
              <span>
                {selectedText.readLife_usage}
            </span>
          </div>
      </div>
      <div className="example-section">
        <span className="example-en">e.g. {selectedText.example_sentence}</span>
        <span className="example-cn">{selectedText.example_translation}</span>
      </div>
      {/* Save Button */}
      <div className="save-section">
        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className={saveStatus === 'success' ?
              "save-section-button active"
              :
              "save-section-button"}
        >
          {saveStatus === 'success' ?
            <span>Unsaved</span> : <span>Save</span>}
        </button>
        {saveStatus === 'error' && (
          <span className="error-message">Failed to save. Try again.</span>
        )}
      </div>
    </div>
  );
}

export default DefinitionPopup;
