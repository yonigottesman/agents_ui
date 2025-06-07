'use client';

interface Part {
  part_kind: string;
  content?: string;
  tool_name?: string;
  args?: any;
  [key: string]: any;
}

interface PartRendererProps {
  parts: Part[];
}

const PartBox: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="border border-[#3a3a3a] rounded-lg p-4 mb-3 bg-[#2a2a2a] shadow-sm">
    <div className="text-sm font-semibold mb-2 text-gray-400 uppercase tracking-wide">
      {title}
    </div>
    <div className="text-gray-100">
      {children}
    </div>
  </div>
);

const PartRenderer: React.FC<PartRendererProps> = ({ parts }) => {
  if (!parts || parts.length === 0) {
    return <div className="text-gray-500 italic">No parts to display</div>;
  }

  // Helper function to safely render content
  const renderContent = (content: any) => {
    if (typeof content === 'string') {
      return content;
    } else if (typeof content === 'object' && content !== null) {
      return JSON.stringify(content, null, 2);
    }
    return String(content);
  };

  return (
    <div className="space-y-2">
      {parts.map((part, index) => {
        switch (part.part_kind) {
          case 'text':
          case 'user-prompt':
            return (
              <PartBox key={index} title={part.part_kind}>
                <div className="whitespace-pre-wrap">{renderContent(part.content)}</div>
              </PartBox>
            );

          case 'tool-call':
            return (
              <PartBox key={index} title="Tool Call">
                <div className="space-y-2">
                  <div>
                    <span className="font-semibold text-blue-400">Tool Name: </span>
                    <span className="font-mono bg-[#1a1a1a] px-2 py-1 rounded border border-[#3a3a3a]">
                      {part.tool_name}
                    </span>
                  </div>
                  {part.args && (
                    <div>
                      <span className="font-semibold text-green-400">Arguments:</span>
                      <pre className="mt-1 bg-[#1a1a1a] p-3 rounded-md overflow-x-auto text-sm border border-[#3a3a3a] text-gray-300">
                        {JSON.stringify(part.args, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </PartBox>
            );

          case 'tool-return':
            return (
              <PartBox key={index} title="Tool Return">
                <div className="bg-[#1a1a1a] p-3 rounded-md border border-[#3a3a3a]">
                  <pre className="whitespace-pre-wrap text-sm overflow-x-auto text-gray-300">
                    {renderContent(part.content)}
                  </pre>
                </div>
              </PartBox>
            );

          default:
            return (
              <PartBox key={index} title={`Unknown Part (${part.part_kind})`}>
                <pre className="bg-[#3a3a3a] p-3 rounded-md text-sm border border-yellow-600 text-yellow-300">
                  {JSON.stringify(part, null, 2)}
                </pre>
              </PartBox>
            );
        }
      })}
    </div>
  );
};

export default PartRenderer; 