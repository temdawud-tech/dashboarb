const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // 'bcrypt' ykn 'bcryptjs' fayyadamuu kee mirkaneessi
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

// 2. SCHEMAS
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
const contactEmergencySchema = new mongoose.Schema({
    studentId: { type: String, trim: true }, // Barataa adda baasuuf
    eName: { type: String, required: true },
    ePhone: { type: String, required: true },
    eRel: String,
    fName: { type: String, required: true },
    fPhone: { type: String, required: true },
    fRel: String,
    createdAt: { type: Date, default: Date.now }
});
const skillSchema = new mongoose.Schema({
    studentId: String,
    skillName: String,
    level: String,
    description: String
});

const resourceSchema = new mongoose.Schema({
    title: String,
    category: String,
    fileName: String,
    fileData: String,
    uploadedBy: String,
    date: { type: Date, default: Date.now }
});

const progressSchema = new mongoose.Schema({
    studentId: String,
    studentName: String,
    level: String,
    detail: String,
    timestamp: { type: Date, default: Date.now }
});

const contactSchema = new mongoose.Schema({
    name: String,
    email: String,
    subject: String,
    message: String,
    date: { type: Date, default: Date.now }
});

// 3. MODELS
const User = mongoose.model('User', userSchema);
const Skill = mongoose.model('Skill', skillSchema);
const Resource = mongoose.model('Resource', resourceSchema);
const Progress = mongoose.model('Progress', progressSchema);
const Contact = mongoose.model('Contact', contactSchema);
// ... Models duraan jiran jala ...
const ContactEmergency = mongoose.model('ContactEmergency', contactEmergencySchema);
// Step 1: General Info Simachuu
app.post('/api/register-step1', async (req, res) => {
    try {
        const { universityId, email } = req.body;

        // Check if student already exists
        const existingUser = await User.findOne({ 
            $or: [{ studentId: universityId }, { email: email }] 
        });

        if (existingUser) {
            return res.status(400).json({ message: "ID or Email already registered!" });
        }

        // Ammaaf ragaa kana "User" model keessatti 'pending' goonee galmeessina
        const newUser = new User({
            studentId: universityId,
            name: req.body.fullName,
            email: email,
            password: "temporary_until_step2", // Step 2 irratti jijjiirama
            status: 'pending'
        });

        await newUser.save();
        res.status(200).json({ message: "Step 1 saved successfully!" });
    } catch (err) {
        res.status(500).json({ message: "Server error during registration" });
    }
});
// 4. API ENDPOINTS

// --- Register ---
app.post('/api/register', async (req, res) => {
    try {
        const { studentId, name, password } = req.body;
        // Password hash gochuu
        const hashedPw = await bcrypt.hash(password, 10);
        const newUser = new User({ studentId, name, password: hashedPw });
        await newUser.save();
        res.status(201).json({ message: "Galmeen milkaa'eera. Admin biratti mirkaneeffama eegi." });
    } catch (err) {
        res.status(400).json({ error: "ID kanaan dura galmaa'eera!" });
    }
});
app.post('/api/register-step2', async (req, res) => {
    try {
        const newData = new ContactEmergency(req.body);
        await newData.save();
        res.status(200).json({ message: "Step 2 Success!" });
    } catch (err) {
        res.status(500).json({ error: "Database Error" });
    }
});
app.post('/api/register-step2', async (req, res) => {
    try {
        const data = req.body;
        
        // 1. Emergency Contact Save gochuu
        const newData = new ContactEmergency(data);
        await newData.save();

        // 2. Password uumuu fi User Update gochuu
        const generatedPassword = crypto.randomBytes(4).toString('hex');
        const hashedPw = await bcrypt.hash(generatedPassword, 10);

        const user = await User.findOneAndUpdate(
            { studentId: data.universityId },
            { password: hashedPw },
            { new: true } // User haaraa email qabu akka nuuf deebisu
        );

        // 3. AMMA ASITTI ERGAMA!
        if (user && user.email) {
            await sendPasswordEmail(user.email, generatedPassword);
            console.log(`✅ Password ergameera: ${user.email}`);
        }

        res.status(200).json({ message: "Step 2 dhumateera, email kee ilaali!" });

    } catch (err) {
        console.error("Step 2 Error:", err);
        res.status(500).json({ error: "Database Error" });
    }
});
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Funksishinii koodii kana gadi kaayi (app.post gubbaatti)
const sendPasswordEmail = async (userEmail, generatedPassword) => {
    // ... koodii mailOptions fi transporter.sendMail ...
};

// --- STEP 2 ENDPOINT (SIRREEFFAME) ---
app.post('/api/register-step2', async (req, res) => {
    try {
        const data = req.body;
        console.log("Data received for Step 2:", data);

        // 1. Ragaa Emergency Contact kuusuu
        const newData = new ContactEmergency(data);
        await newData.save();

        // 2. User-ni kanaan dura Step 1 irratti uumame 'active' gochuuf ykn password jijjiiruuf
        // Hubachiisa: universityId frontend irraa dhufuu qaba
        if (data.universityId) {
            const generatedPassword = crypto.randomBytes(4).toString('hex');
            const hashedPw = await bcrypt.hash(generatedPassword, 10);

            await User.findOneAndUpdate(
                { studentId: data.universityId },
                { password: hashedPw, status: 'pending' } // Admin hamma mirkaneessutti pending deebisina
            );
            
            console.log(`Generated Password for ${data.universityId}: ${generatedPassword}`);
            // Asitti Nodemailer itti dabaluu dandeessa
        }

        res.status(200).json({ message: "Step 2 Success! Data saved." });
    } catch (err) {
        console.error("Step 2 Error:", err);
        res.status(500).json({ error: "Database Error: " + err.message });
    }
});

// --- Login (Sirreeffame) ---
app.post('/api/login', async (req, res) => {
    try {
        const { studentId, password } = req.body;
        console.log("Login yaalii ID:", studentId);

        // 'User' model fayyadamna
        const student = await User.findOne({ studentId: studentId });

        if (!student) {
            return res.status(400).json({ message: "Barataan ID kanaan hin argamne!" });
        }

        // Status active ta'uu isaa mirkaneessuu
        if (student.status !== 'active') {
            return res.status(403).json({ message: "Account kee hamma Admin mirkaneessutti eagi!" });
        }

        // Password Bcrypt fayyadamnee wal bira qabna
        const isMatch = await bcrypt.compare(password, student.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Password dogoggora!" });
        }

        // Login milkaa'eera - Ragaa Frontend barbaadu deebisuu
        res.json({
            message: "Baga nagaan dhufte!",
            token: "dummy-token-12345", // JWT 'token' asitti uumuu dandeessa
            name: student.name,
            role: student.role || 'student'
        });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ message: "Server Error uumameera" });
    }
});

// --- Admin APIs ---
app.get('/api/admin/students', async (req, res) => {
    try {
        const students = await User.find({ role: 'student' });
        res.json(students);
    } catch (err) {
        res.status(500).json({ message: "Ragaa fiduun hin danda'amne" });
    }
});

// Admin Approve (Sirreeffame)
app.put('/api/admin/approve', async (req, res) => {
    try {
        const studentId = req.query.studentId; 
        const updatedStudent = await User.findOneAndUpdate(
            { studentId: studentId }, 
            { status: 'active' }, 
            { new: true }
        );

        if (!updatedStudent) {
            return res.status(404).json({ message: "Barataan hin argamne" });
        }
        res.json({ message: "Barataan mirkanaa'eera!", student: updatedStudent });
    } catch (err) {
        res.status(500).json({ message: "Error uumameera" });
    }
});

// --- Feature APIs ---
app.post('/api/skills', async (req, res) => {
    try {
        const newSkill = new Skill(req.body);
        await newSkill.save();
        res.json({ message: "Skill galmeeffameera!" });
    } catch (err) { res.status(500).send(err); }
});

app.post('/api/progress', async (req, res) => {
    try {
        const newProgress = new Progress(req.body);
        await newProgress.save();
        res.json({ message: "Gabaasni ergameera!" });
    } catch (err) { res.status(500).send(err); }
});

app.post('/api/contact', async (req, res) => {
    try {
        const newMessage = new Contact(req.body);
        await newMessage.save();
        res.json({ message: "Ergaan kee ga'eera!" });
    } catch (err) { res.status(500).send(err); }
});

// 5. Server Start
const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));

app.get("/", (req, res) => {
  res.send("Server is running ✅");
});