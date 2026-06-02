'use client';

import { useReducer, useRef, type ChangeEvent, type DragEvent, type FormEvent, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, Terminal, Shield, ArrowRight, FileJson } from 'lucide-react';
import { processAuthDetails, validateAuthDetailsShape } from '@/lib/iam-utils';
import { RawIAMData } from '@/lib/types';
import { indexedDBService } from '@/lib/indexeddb';
import { toast } from 'sonner';

export const metadata = {
  title: "Upload IAM Data",
  description: "Upload and analyze account-authorization-details.json files locally.",
};

type HomeState = {
  file: File | null;
  name: string;
  isLoading: boolean;
  error: string;
  isDragOver: boolean;
};

type HomeAction =
  | { type: "select_file"; file: File | null }
  | { type: "set_name"; name: string }
  | { type: "set_loading"; isLoading: boolean }
  | { type: "set_error"; error: string }
  | { type: "set_drag_over"; isDragOver: boolean };

const initialHomeState: HomeState = {
  file: null,
  name: '',
  isLoading: false,
  error: '',
  isDragOver: false,
};

function homeReducer(state: HomeState, action: HomeAction): HomeState {
  switch (action.type) {
    case "select_file":
      return {
        ...state,
        file: action.file,
        error: action.file ? '' : state.error,
      };
    case "set_name":
      return { ...state, name: action.name };
    case "set_loading":
      return { ...state, isLoading: action.isLoading };
    case "set_error":
      return { ...state, error: action.error };
    case "set_drag_over":
      return { ...state, isDragOver: action.isDragOver };
    default:
      return state;
  }
}

function handleDragOver(event: DragEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default function HomePage() {
  const [state, dispatch] = useReducer(homeReducer, initialHomeState);
  const { file, name, isLoading, error, isDragOver } = state;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const selectFile = (selectedFile: File) => {
    if (selectedFile.name.endsWith('.json')) {
      dispatch({ type: "select_file", file: selectedFile });
      dispatch({ type: "set_error", error: '' });
    } else {
      dispatch({ type: "set_error", error: 'Please upload a JSON file' });
      dispatch({ type: "select_file", file: null });
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) selectFile(selectedFile);
  };

  const handleDragEnter = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dispatch({ type: "set_drag_over", isDragOver: true });
  };

  const handleDragLeave = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dispatch({ type: "set_drag_over", isDragOver: false });
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dispatch({ type: "set_drag_over", isDragOver: false });
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) selectFile(droppedFile);
  };

  const openFileDialog = () => fileInputRef.current?.click();

  const handleDropZoneKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openFileDialog();
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      dispatch({ type: "set_error", error: 'Please select a file' });
      return;
    }
    dispatch({ type: "set_loading", isLoading: true });
    dispatch({ type: "set_error", error: '' });
    try {
      const text = await file.text();
      const parsedData: unknown = JSON.parse(text);
      const validationErrors = validateAuthDetailsShape(parsedData);
      if (validationErrors.length > 0) {
        dispatch({ type: "set_error", error: validationErrors.join(' ') });
        dispatch({ type: "set_loading", isLoading: false });
        return;
      }
      const data = parsedData as RawIAMData;
      const processedData = processAuthDetails(data);
      const uploadId = generateUUID();
      const uploadData = {
        id: uploadId,
        name: name || file.name,
        originalFilename: file.name,
        uploadedAt: new Date().toISOString(),
        size: file.size,
        data: processedData,
      };
      await indexedDBService.saveUpload(uploadData);
      await indexedDBService.setCurrentUploadId(uploadId);
      toast.success('Upload complete! Navigating to dashboard...');
      router.push('/dashboard');
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        dispatch({ type: "set_error", error: `JSON parsing error: ${error.message}` });
      } else if (error instanceof Error) {
        dispatch({ type: "set_error", error: `Processing error: ${error.message}` });
      } else {
        dispatch({ type: "set_error", error: 'Error processing file. Please ensure it\'s a valid account-authorization-details.json file.' });
      }
    } finally {
      dispatch({ type: "set_loading", isLoading: false });
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-16 py-12">
      <div className="space-y-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-[0.2em]">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>AWS Security Analysis Tool</span>
          </div>
          <h1 className="text-5xl font-bold leading-[1.05] tracking-tight">
            <span className="text-foreground">Audit your</span>
            <br />
            <span className="text-amber-500">IAM permissions</span>
            <span className="text-muted-foreground">.</span>
          </h1>
          <p className="text-base text-muted-foreground max-w-lg leading-relaxed">
            Upload an <code className="font-mono text-xs bg-secondary px-1.5 py-0.5 text-amber-500/80">
              account-authorization-details.json
            </code> file. Everything runs locally in your browser, no data leaves your machine.
          </p>
        </div>

        <div className="flex gap-6 text-xs font-mono text-muted-foreground/60">
          <div className="flex items-center gap-2">
            <span className="text-amber-500/60">01</span>
            <span>Upload JSON</span>
          </div>
          <span className="text-muted-foreground/30">→</span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground/40">02</span>
            <span>Analyze Locally</span>
          </div>
          <span className="text-muted-foreground/30">→</span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground/40">03</span>
            <span>Audit & Fix</span>
          </div>
        </div>
      </div>

      <div className="border border-border bg-card">
        <div className="h-1 bg-gradient-to-r from-amber-500 via-amber-500/50 to-transparent" />

        <div className="p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-8 bg-amber-500/10">
              <FileJson className="size-4 text-amber-500" />
            </div>
            <div>
              <h2 className="font-bold text-sm uppercase tracking-wider">Upload IAM Data</h2>
              <p className="text-xs text-muted-foreground">account-authorization-details.json</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <Alert variant="destructive" className="border-l-2 border-l-destructive">
                <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                Upload Name <span className="text-muted-foreground/40">(optional)</span>
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="e.g., Production Account"
                value={name}
                onChange={(e) => dispatch({ type: "set_name", name: e.target.value })}
                className="font-mono text-sm bg-secondary/50 border-border focus:border-amber-500/50 transition-colors"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="file" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                JSON File
              </Label>
              <button
                type="button"
                className={`border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-150 ${
                  isDragOver
                    ? 'border-amber-500 bg-amber-500/5 scale-[1.01]'
                    : file
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-border hover:border-amber-500/30 hover:bg-secondary/30'
                }`}
                onClick={openFileDialog}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onKeyDown={handleDropZoneKeyDown}
                tabIndex={0}
              >
                <div className={`mb-3 transition-transform duration-150 ${isDragOver ? 'scale-110' : ''}`}>
                  {file ? (
                    <FileJson className="size-10 mx-auto text-emerald-500" />
                  ) : (
                    <Upload className={`size-10 mx-auto ${isDragOver ? 'text-amber-500' : 'text-muted-foreground/40'}`} />
                  )}
                </div>
                {file ? (
                  <div className="space-y-1">
                    <p className="text-sm font-mono font-medium text-foreground">{file.name}</p>
                    <p className="text-xs font-mono text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB, click or drop to change
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {isDragOver ? 'Drop your file here' : 'Drag & drop your JSON file here'}
                    </p>
                    <p className="text-xs font-mono text-muted-foreground">
                      or click to browse
                    </p>
                  </div>
                )}
                <Input
                  ref={fileInputRef}
                  id="file"
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                  required
                  className="hidden"
                />
              </button>
            </div>

            <Button
              type="submit"
              disabled={isLoading || !file}
              className="w-full h-11 font-bold text-sm uppercase tracking-wider bg-amber-500 hover:bg-amber-400 text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin size-4 border-2 border-black/30 border-t-black rounded-full" />
                  Processing…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Upload and Analyze
                  <ArrowRight className="size-4" />
                </span>
              )}
            </Button>
          </form>
        </div>
      </div>

      <div className="border border-border bg-card/50">
        <div className="p-8 space-y-4">
          <div className="flex items-center gap-3">
            <Terminal className="size-4 text-muted-foreground" />
            <h3 className="font-bold text-sm uppercase tracking-wider">CLI Instructions</h3>
          </div>
          <div className="font-mono text-xs text-muted-foreground space-y-2">
            <p className="flex items-center gap-2">
              <span className="text-amber-500/60">$</span>
              <span>aws iam get-account-authorization-details</span>
              <span className="text-muted-foreground/50">--output json</span>
              <span className="text-muted-foreground/50">&gt;</span>
              <span className="text-emerald-500/60">account-authorization-details.json</span>
            </p>
          </div>

          <Alert className="border-l-2 border-l-amber-500/50 bg-amber-500/5">
            <Shield className="size-4 text-amber-500" />
            <AlertDescription className="text-xs">
              <span className="text-amber-500 font-bold">LOCAL ONLY:</span> All processing happens in your browser.
              No data is sent to external servers, your AWS credentials and IAM data remain on your machine.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </div>
  );
}
