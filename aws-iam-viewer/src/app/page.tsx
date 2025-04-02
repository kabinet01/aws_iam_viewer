'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, Terminal, Shield } from 'lucide-react';
import { processAuthDetails } from '@/lib/iam-utils';
import { RawIAMData } from '@/lib/types';
import { indexedDBService } from '@/lib/indexeddb';

// UUID generation function with fallback for environments without crypto.randomUUID
function generateUUID(): string {
  // Use crypto.randomUUID if available
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  
  // Fallback implementation for browsers without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.name.endsWith('.json')) {
        setFile(selectedFile);
        setError('');
      } else {
        setError('Please upload a JSON file');
        setFile(null);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select a file');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      console.log('Starting file processing...');
      console.log('File size:', file.size, 'bytes');
      console.log('File name:', file.name);
      
      const text = await file.text();
      console.log('File text loaded, length:', text.length);
      console.log('First 500 characters:', text.substring(0, 500));
      
      console.log('Attempting to parse JSON...');
      const data: RawIAMData = JSON.parse(text);
      console.log('JSON parsed successfully');
      console.log('Data structure:', {
        UserDetailList: data.UserDetailList?.length || 0,
        RoleDetailList: data.RoleDetailList?.length || 0,
        Policies: data.Policies?.length || 0,
        GroupDetailList: data.GroupDetailList?.length || 0
      });
      
      console.log('Processing data with processAuthDetails...');
      const processedData = processAuthDetails(data);
      console.log('Data processing completed successfully');
      console.log('Processed data structure:', {
        users: Object.keys(processedData.users).length,
        roles: Object.keys(processedData.roles).length,
        policies: Object.keys(processedData.policies).length,
        groups: Object.keys(processedData.groups).length
      });
      
      // Create upload data for IndexedDB storage
      // Use crypto.randomUUID() with fallback for environments where it's not available
      const uploadId = generateUUID();
      const uploadData = {
        id: uploadId,
        name: name || file.name,
        originalFilename: file.name,
        uploadedAt: new Date().toISOString(),
        size: file.size,
        data: processedData
      };

      console.log('Storing data in IndexedDB...');
      // Store data in IndexedDB
      await indexedDBService.saveUpload(uploadData);
      
      // Set current upload
      await indexedDBService.setCurrentUploadId(uploadId);
      
      console.log('Upload completed successfully, navigating to dashboard...');
      // Navigate to dashboard
      router.push('/dashboard');
    } catch (error: unknown) {
      console.error('Error during file processing:', error);
      
      if (error instanceof Error) {
        console.error('Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
        
        if (error instanceof SyntaxError) {
          setError(`JSON parsing error: ${error.message}`);
        } else {
          setError(`Processing error: ${error.message}`);
        }
      } else {
        console.error('Unknown error type:', error);
        setError('Error processing file. Please ensure it\'s a valid account-authorization-details.json file.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">AWS IAM Authorization Details Viewer</h1>
        <p className="text-xl text-muted-foreground">
          Upload and analyze your AWS IAM authorization details
        </p>
      </div>

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Upload className="h-5 w-5" />
            <span>Upload your account-authorization-details.json file</span>
          </CardTitle>
          <CardDescription>
            Select your JSON file to begin analyzing your IAM resources
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Name (optional)</Label>
              <Input
                id="name"
                type="text"
                placeholder="e.g., Production Account"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="file">JSON File</Label>
              <Input
                id="file"
                type="file"
                accept=".json"
                onChange={handleFileChange}
                required
              />
              {file && (
                <p className="text-sm text-muted-foreground">
                  Selected: {file.name} ({file.size} bytes)
                </p>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading || !file}
            >
              {isLoading ? 'Processing...' : 'Upload and Analyze'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Terminal className="h-5 w-5" />
            <span>How to get your account-authorization-details.json file</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Install the AWS CLI and configure it with appropriate credentials</li>
            <li>Run the following command:
              <pre className="mt-2 p-3 bg-muted rounded-md overflow-x-auto">
                aws iam get-account-authorization-details --output json &gt; account-authorization-details.json
              </pre>
            </li>
            <li>Upload the generated file using the form above</li>
          </ol>
          
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              <strong>Note:</strong> All processing is done in your browser. Your AWS data is not sent to any external servers.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
