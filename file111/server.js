const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use('/uploads', express.static('uploads'));

// File upload configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});

const upload = multer({ storage: storage });

// Ensure directories exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Questions database (in production, use MongoDB/MySQL)
let questions = [];
const QUESTIONS_FILE = 'questions.json';

// Load questions from file
if (fs.existsSync(QUESTIONS_FILE)) {
  questions = JSON.parse(fs.readFileSync(QUESTIONS_FILE));
}

// Save questions to file
function saveQuestions() {
  fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(questions, null, 2));
}

// API Routes

// 1. Upload files (PDF, DOC, TXT, etc.)
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  res.json({
    message: 'File uploaded successfully',
    filename: req.file.filename,
    originalname: req.file.originalname,
    path: `/uploads/${req.file.filename}`
  });
});

// 2. Create exam question from file content
app.post('/api/questions', (req, res) => {
  const { question, options, correctAnswer, marks, fileUrl } = req.body;
  
  const newQuestion = {
    id: questions.length + 1,
    question,
    options,
    correctAnswer,
    marks: marks || 1,
    fileUrl,
    createdAt: new Date().toISOString()
  };
  
  questions.push(newQuestion);
  saveQuestions();
  
  res.json({ message: 'Question added successfully', question: newQuestion });
});

// 3. Get all questions
app.get('/api/questions', (req, res) => {
  res.json(questions);
});

// 4. Get single question
app.get('/api/questions/:id', (req, res) => {
  const question = questions.find(q => q.id === parseInt(req.params.id));
  if (!question) {
    return res.status(404).json({ error: 'Question not found' });
  }
  res.json(question);
});

// 5. Submit exam
app.post('/api/submit-exam', (req, res) => {
  const { answers, studentName } = req.body;
  let score = 0;
  let totalMarks = 0;
  const results = [];
  
  answers.forEach(answer => {
    const question = questions.find(q => q.id === answer.questionId);
    if (question) {
      totalMarks += question.marks;
      const isCorrect = question.correctAnswer === answer.selectedOption;
      if (isCorrect) {
        score += question.marks;
      }
      results.push({
        questionId: question.id,
        question: question.question,
        selectedOption: answer.selectedOption,
        correctAnswer: question.correctAnswer,
        isCorrect,
        marks: question.marks
      });
    }
  });
  
  const percentage = (score / totalMarks) * 100;
  
  const result = {
    studentName,
    score,
    totalMarks,
    percentage: percentage.toFixed(2),
    results,
    submittedAt: new Date().toISOString()
  };
  
  // Save result to file (in production, save to database)
  const resultsFile = 'exam-results.json';
  let allResults = [];
  if (fs.existsSync(resultsFile)) {
    allResults = JSON.parse(fs.readFileSync(resultsFile));
  }
  allResults.push(result);
  fs.writeFileSync(resultsFile, JSON.stringify(allResults, null, 2));
  
  res.json(result);
});

// 6. Parse text file for questions
app.post('/api/parse-file', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const filePath = req.file.path;
  const fileContent = fs.readFileSync(filePath, 'utf8');
  
  // Simple parsing logic (customize based on your file format)
  const parsedQuestions = parseFileContent(fileContent);
  
  res.json({
    message: 'File parsed successfully',
    questions: parsedQuestions,
    fileUrl: `/uploads/${req.file.filename}`
  });
});

function parseFileContent(content) {
  // This is a simple parser. Customize it based on your file format
  const lines = content.split('\n');
  const questions = [];
  let currentQuestion = null;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (trimmedLine.match(/^\d+[\.\)]/)) {
      if (currentQuestion) {
        questions.push(currentQuestion);
      }
      currentQuestion = {
        question: trimmedLine,
        options: [],
        correctAnswer: ''
      };
    } else if (trimmedLine.match(/^[A-D][\.\)]/)) {
      if (currentQuestion) {
        currentQuestion.options.push(trimmedLine);
      }
    } else if (trimmedLine.toLowerCase().startsWith('answer:')) {
      if (currentQuestion) {
        currentQuestion.correctAnswer = trimmedLine.split(':')[1].trim();
      }
    }
  }
  
  if (currentQuestion) {
    questions.push(currentQuestion);
  }
  
  return questions;
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});