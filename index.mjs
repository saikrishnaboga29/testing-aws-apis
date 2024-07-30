import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env

import express from 'express';
import multer from 'multer';
import AWS from 'aws-sdk';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

const app = express();
const port = 3000;

// AWS Configuration
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'ap-southeast-2' // Asia Pacific (Sydney) region
});

const s3 = new AWS.S3();
const transcribeService = new AWS.TranscribeService();

// CORS configuration
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic GET method for testing
app.get('/hello', (req, res) => {
    res.send('Hello World');
});

// Basic POST method for testing
app.post('/echo', (req, res) => {
    res.json(req.body);
});

// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/upload', upload.single('file'), async (req, res) => {
    const file = req.file;
    const fileName = `${uuidv4()}-${file.originalname}`;
    const s3Params = {
        Bucket: 'node-transcript', // Your bucket name
        Key: fileName,
        Body: file.buffer
    };

    try {
        // Upload file to S3
        await s3.upload(s3Params).promise();
        console.log('File uploaded successfully');

        // Start Transcription Job
        const transcribeParams = {
            TranscriptionJobName: uuidv4(),
            LanguageCode: 'en-US', // Update with your language code if needed
            Media: {
                MediaFileUri: `s3://node-transcript/${fileName}` // Your bucket name
            },
            OutputBucketName: 'node-transcript' // Your bucket name
        };

        const data = await transcribeService.startTranscriptionJob(transcribeParams).promise();
        console.log('Transcription job started:', data);
        res.json({ message: 'File uploaded and transcription job started', jobId: data.TranscriptionJob.TranscriptionJobName });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/transcription/:jobId', async (req, res) => {
    const { jobId } = req.params;

    try {
        const data = await transcribeService.getTranscriptionJob({ TranscriptionJobName: jobId }).promise();
        if (data.TranscriptionJob.TranscriptionJobStatus === 'COMPLETED') {
            const transcriptionUrl = data.TranscriptionJob.Transcript.TranscriptFileUri;

            // Fetch the transcription JSON file from the S3 URL
            const transcriptionResponse = await axios.get(transcriptionUrl);
            const transcriptionText = transcriptionResponse.data.results.transcripts.map(t => t.transcript).join('\n');

            res.json({ transcriptionText });
        } else {
            res.json({ message: 'Transcription job is still in progress' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

