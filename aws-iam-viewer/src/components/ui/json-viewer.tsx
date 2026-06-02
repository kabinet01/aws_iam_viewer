'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface JSONViewerProps {
  data: unknown;
  className?: string;
}

interface Token {
  type: 'string' | 'number' | 'boolean' | 'null' | 'key' | 'punctuation' | 'whitespace';
  value: string;
  start: number;
}

const tokenTypeClasses: Record<Token['type'], string> = {
  string: "text-green-600 dark:text-green-500",
  number: "text-orange-600 dark:text-orange-400",
  boolean: "text-blue-600 dark:text-blue-500",
  null: "text-red-600 dark:text-red-500",
  key: "text-violet-600 dark:text-violet-500",
  punctuation: "text-gray-600 dark:text-gray-400",
  whitespace: "",
};

function tokenize(json: unknown): Token[] {
  const jsonString = typeof json === 'string' ? json : JSON.stringify(json, null, 4);
  const tokens: Token[] = [];
  let current = 0;

  while (current < jsonString.length) {
    const char = jsonString[current];

    if (/\s/.test(char)) {
      let whitespace = '';
      while (current < jsonString.length && /\s/.test(jsonString[current])) {
        whitespace += jsonString[current];
        current++;
      }
      tokens.push({ type: 'whitespace', value: whitespace, start: current - whitespace.length });
      continue;
    }

    if (char === '"') {
      const start = current;
      let string = '"';
      let isKey = false;
      current++;

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
        string += jsonString[current];
        current++;
      }

      let nextNonWhitespace = current;
      while (nextNonWhitespace < jsonString.length && /\s/.test(jsonString[nextNonWhitespace])) {
        nextNonWhitespace++;
      }
      isKey = nextNonWhitespace < jsonString.length && jsonString[nextNonWhitespace] === ':';

      tokens.push({
        type: isKey ? 'key' : 'string',
        value: string,
        start,
      });
      continue;
    }

    if (/[\d-]/.test(char)) {
      let number = '';
      while (current < jsonString.length && /[\d.eE+-]/.test(jsonString[current])) {
        number += jsonString[current];
        current++;
      }
      tokens.push({ type: 'number', value: number, start: current - number.length });
      continue;
    }

    if (char === 't' && jsonString.slice(current, current + 4) === 'true') {
      tokens.push({ type: 'boolean', value: 'true', start: current });
      current += 4;
      continue;
    }

    if (char === 'f' && jsonString.slice(current, current + 5) === 'false') {
      tokens.push({ type: 'boolean', value: 'false', start: current });
      current += 5;
      continue;
    }

    if (char === 'n' && jsonString.slice(current, current + 4) === 'null') {
      tokens.push({ type: 'null', value: 'null', start: current });
      current += 4;
      continue;
    }

    if (/[{}[\],:]/.test(char)) {
      tokens.push({ type: 'punctuation', value: char, start: current });
      current++;
      continue;
    }

    current++;
  }

  return tokens;
}

function renderToken(token: Token): React.ReactNode {
  const baseClasses = "font-mono";
  return (
    <span key={`${token.start}-${token.type}-${token.value}`} className={cn(baseClasses, tokenTypeClasses[token.type])}>
      {token.value}
    </span>
  );
}

export function JSONViewer({ data, className }: JSONViewerProps) {
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
      "json-viewer p-4 border bg-background font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap break-all",
      className
    )}>
      {tokens.map((token) => renderToken(token))}
    </div>
  );
}
