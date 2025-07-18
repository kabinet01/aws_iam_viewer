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
      const text = await file.text();
      const data: RawIAMData = JSON.parse(text);
      
      // Process the data
      const processedData = processAuthDetails(data);
      
      // Store in localStorage (in a real app, you'd use a proper state management solution)
      const uploadId = crypto.randomUUID();
      const uploadData = {
        id: uploadId,
        name: name || file.name,
        originalFilename: file.name,
        uploadedAt: new Date().toISOString(),
        size: file.size,
        data: processedData
      };

      // Store uploads metadata
      const uploads = JSON.parse(localStorage.getItem('iam-uploads') || '{}');
      uploads[uploadId] = uploadData;
      localStorage.setItem('iam-uploads', JSON.stringify(uploads));
      
      // Set current upload
      localStorage.setItem('iam-current-upload', uploadId);
      
      // Navigate to dashboard
      router.push('/dashboard');
    } catch {
      setError('Error processing file. Please ensure it\'s a valid account-authorization-details.json file.');
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
