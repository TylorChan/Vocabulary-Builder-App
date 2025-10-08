function DefinitionPopup({ selectedText }) {
  return (
    <div className="trans-definition">
      <div className="definition">
        <span>
          {selectedText.definition}
        </span>
      </div>
      <div className="realLife-definition">
        <span>
          {selectedText.readLife_usage}
        </span>
      </div>
      <div className="example-section">
        <span className="example-en">e.g. {selectedText.example_sentence}</span>
        <span className="example-cn">{selectedText.example_translation}</span>
      </div>
    </div>
  );
}

export default DefinitionPopup;
