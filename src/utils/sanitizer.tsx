import React from "react";

// Safe renderer for AI text to prevent XSS (converts markdown bold, bullet lists, and newlines to React elements directly)
export const renderSafeAIContent = (text: string) => {
  const lines = text.split("\n");

  return (
    <span className="text-sm leading-relaxed">
      {lines.map((line, lineIdx) => {
        // Check for bullet lists
        let processedLine = line;
        const bulletMatch = line.match(/^\s*\*\s+(.*)$/);
        if (bulletMatch) {
          processedLine = `• ${bulletMatch[1]}`;
        }

        // Split line into bold and non-bold segments
        const segments = processedLine.split(/(\*\*.*?\*\*)/g);

        return (
          <React.Fragment key={`line-${lineIdx}`}>
            {lineIdx > 0 && <br />}
            {segments.map((segment, segIdx) => {
              if (segment.startsWith("**") && segment.endsWith("**")) {
                return (
                  <strong key={`seg-${segIdx}`}>
                    {segment.slice(2, -2)}
                  </strong>
                );
              }
              return segment;
            })}
          </React.Fragment>
        );
      })}
    </span>
  );
};
