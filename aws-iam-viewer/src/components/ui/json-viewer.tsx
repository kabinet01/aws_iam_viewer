'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface JSONViewerProps {
  data: Record<string, unknown> | string | null;
  className?: string;
}

interface Token {
  type: 'string' | 'number' | 'boolean' | 'null' | 'key' | 'punctuation' | 'whitespace';
  value: string;
}

export function JSONViewer({ data, className }: JSONViewerProps) {
  const tokenize = (json: Record<string, unknown> | string): Token[] => {
    const jsonString = typeof json === 'string' ? json : JSON.stringify(json, null, 4);
    const tokens: Token[] = [];
    let current = 0;

    while (current < jsonString.length) {
      const char = jsonString[current];

      // Handle whitespace
      if (/\s/.test(char)) {
        let whitespace = '';
        while (current < jsonString.length && /\s/.test(jsonString[current])) {
          whitespace += jsonString[current];
          current++;
        }
        tokens.push({ type: 'whitespace', value: whitespace });
        continue;
      }

      // Handle strings
      if (char === '"') {
        let string = '';
        let isKey = false;
        current++; // Skip opening quote
        
        while (current < jsonString.length && jsonString[current] !== '"') {
          if (jsonString[current] === '\\') {
            string += jsonString[current];
            current++;
            if (current < jsonString.length) {
              string += jsonString[current];
            }
          } else {
            string += jsonString[current];
          }
          current++;
        }
        
        if (current < jsonString.length) {
          string += jsonString[current]; // Add closing quote
          current++;
        }

        // Check if this is a key (followed by colon)
        let nextNonWhitespace = current;
        while (nextNonWhitespace < jsonString.length && /\s/.test(jsonString[nextNonWhitespace])) {
          nextNonWhitespace++;
        }
        isKey = nextNonWhitespace < jsonString.length && jsonString[nextNonWhitespace] === ':';

        tokens.push({ 
          type: isKey ? 'key' : 'string', 
          value: string 
        });
        continue;
      }

      // Handle numbers
      if (/[\d-]/.test(char)) {
        let number = '';
        while (current < jsonString.length && /[\d.eE+-]/.test(jsonString[current])) {
          number += jsonString[current];
          current++;
        }
        tokens.push({ type: 'number', value: number });
        continue;
      }

      // Handle booleans and null
      if (char === 't' && jsonString.slice(current, current + 4) === 'true') {
        tokens.push({ type: 'boolean', value: 'true' });
        current += 4;
        continue;
      }
      if (char === 'f' && jsonString.slice(current, current + 5) === 'false') {
        tokens.push({ type: 'boolean', value: 'false' });
        current += 5;
        continue;
      }
      if (char === 'n' && jsonString.slice(current, current + 4) === 'null') {
        tokens.push({ type: 'null', value: 'null' });
        current += 4;
        continue;
      }

      // Handle punctuation
      if (/[{}[\],:]/.test(char)) {
        tokens.push({ type: 'punctuation', value: char });
        current++;
        continue;
      }

      // Skip unknown characters
      current++;
    }

    return tokens;
  };

  const renderToken = (token: Token, index: number) => {
    const baseClasses = "font-mono";
    const typeClasses = {
      string: "text-green-600 dark:text-green-500",
      number: "text-orange-600 dark:text-orange-400",
      boolean: "text-blue-600 dark:text-blue-500",
      null: "text-red-600 dark:text-red-500",
      key: "text-violet-600 dark:text-violet-500",
      punctuation: "text-gray-600 dark:text-gray-400",
      whitespace: ""
    };

    return (
      <span
        key={index}
        className={cn(baseClasses, typeClasses[token.type])}
      >
        {token.type === 'whitespace' ? token.value : token.value}
      </span>
    );
  };

  if (!data) {
    return (
      <div className={cn("json-viewer", className)}>
        <span className="text-muted-foreground">No data available</span>
      </div>
    );
  }

  const tokens = tokenize(data);

  return (
    <div className={cn(
      "json-viewer p-4 border rounded-md bg-background font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre",
      className
    )}>
      {tokens.map((token, index) => renderToken(token, index))}
    </div>
  );
} 