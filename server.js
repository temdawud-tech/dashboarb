const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// 1. Connection Database (MongoDB)
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/auwcmsj')
    .then(() => console.log("✅ MongoDB Connected: auwcmsj"))
    .catch(err => console.log("❌ Connection Error:", err));

// 2. SCHEMAS (Bakka tokkotti qofa uumaman)

// User Schema (Register, Login, Admin)
const userSchema = new mongoose.Schema({
    studentId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['student', 'admin'], default: 'student' },
    status: { type: String, enum: ['pending', 'active', 'blocked'], default: 'pending' },
    isVerified: { type: Boolean, default: false },
    verificationCode: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});

// Skills Schema (skill.html)
const skillSchema = new mongoose.Schema({
    studentId: String,
    skillName: String,
    level: String,
    description: String
});

// Resources Schema
const resourceSchema = new mongoose.Schema({
    title: String,
    category: String,
    fileName: String,
    fileData: String,
    uploadedBy: String,
    date: { type: Date, default: Date.now }
});

// Student Progress Schema
const progressSchema = new mongoose.Schema({
    studentId: String,
    studentName: String,
    level: String,
    detail: String,
    timestamp: { type: Date, default: Date.now }
});

// Contact & Feedback Schema (fcontact.html)
const contactSchema = new mongoose.Schema({
    name: String,
    email: String,
    subject: String,
    message: String,
    date: { type: Date, default: Date.now }
});

// 3. MODELS (Bakka tokkotti uumaman)
const User = mongoose.model('User', userSchema);
const Skill = mongoose.model('Skill', skillSchema);
const Resource = mongoose.model('Resource', resourceSchema);
const Progress = mongoose.model('Progress', progressSchema);
const Contact = mongoose.model('Contact', contactSchema);

// 4. API ENDPOINTS

// --- Auth APIs ---
app.post('/api/register', async (req, res) => {
    try {
        const { studentId, name, password } = req.body;
        const hashedPw = await bcrypt.hash(password, 10);
        const newUser = new User({ studentId, name, password: hashedPw });
        await newUser.save();
        res.status(201).json({ message: "Galmeen milkaa'eera. Admin biratti mirkaneeffama eegi." });
    } catch (err) {
        res.status(400).json({ error: "ID kanaan dura galmaa'eera!" });
    }
});

app.post('/api/login', async (req, res) => {
    const { studentId, password } = req.body;
    const user = await User.findOne({ studentId });
    if (!user) return res.status(404).json({ error: "Barataa hin argamne!" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Password dogoggora!" });

    if (user.status !== 'active') return res.status(403).json({ error: "Account kee hin mirkanoofne!" });

    const token = jwt.sign({ id: user._id, role: user.role }, 'SECRET_KEY', { expiresIn: '1d' });
    res.json({ token, role: user.role, name: user.name });
});

// --- Admin APIs ---
app.get('/api/admin/students', async (req, res) => {
    const students = await User.find({ role: 'student' });
    res.json(students);
});

app.put('/api/admin/approve/:id', async (req, res) => {
    await User.findOneAndUpdate({ studentId: req.params.id }, { status: 'active' });
    res.json({ message: "Barataa mirkanaa'eera!" });
});

// --- Feature APIs ---
app.post('/api/skills', async (req, res) => {
    const newSkill = new Skill(req.body);
    await newSkill.save();
    res.json({ message: "Skill galmeeffameera!" });
});

app.post('/api/progress', async (req, res) => {
    const newProgress = new Progress(req.body);
    await newProgress.save();
    res.json({ message: "Gabaasni ergameera!" });
});

app.post('/api/contact', async (req, res) => {
    const newMessage = new Contact(req.body);
    await newMessage.save();
    res.json({ message: "Ergaan kee ga'eera!" });
});

// 5. Server Start
const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));