const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// 1. Connection Database
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/auwcmsj')
    .then(() => console.log("✅ MongoDB Connected: auwcmsj"))
    .catch(err => console.log("❌ Connection Error:", err));

// 2. MODELS
const userSchema = new mongoose.Schema({
    studentId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true },
    email: { type: String },
    password: { type: String, required: true },
    role: { type: String, enum: ['student', 'admin'], default: 'student' },
    status: { type: String, enum: ['pending', 'active', 'blocked'], default: 'pending' },
    eName: { type: String },
    ePhone: { type: String },
    eRel: { type: String },
    fName: { type: String },
    fPhone: { type: String },
    fRel: { type: String },
    academicSkill: { type: String },
    spiritualSkill: { type: String },
    contribution: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

const ContactEmergency = mongoose.model('ContactEmergency', new mongoose.Schema({
    universityId: { type: String, required: true },
    eName: String, 
    ePhone: String, 
    eRel: String,
    fName: String, 
    fPhone: String, 
    fRel: String
}));

// 3. NODEMAILER
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendPasswordEmail = async (userEmail, generatedPassword) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: userEmail,
        subject: 'AUWCMSJ Password',
        text: `Baga nagaan dhufte! Password kee: ${generatedPassword}`
    };
    return transporter.sendMail(mailOptions);
};

// 4. API ENDPOINTS
app.post('/api/register-step1', async (req, res) => {
    try {
        const { universityId, email, fullName } = req.body;
        const existing = await User.findOne({ studentId: universityId });
        if (existing) return res.status(400).json({ message: "ID is already registered!" });

        const newUser = new User({
            studentId: universityId,
            name: fullName,
            email: email,
            password: "temporary_until_step2",
            status: 'pending'
        });
        await newUser.save();
        res.status(200).json({ message: "Step 1 saved!" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/register-step2', async (req, res) => {
    try {
        const data = req.body;
        
        // Debugging: Ragaa HTML irraa dhufe terminal irratti siif argisiisa
        console.log("Ragaa Step 2 irraa dhufe:", data);

        if (!data.universityId) {
            return res.status(400).json({ error: "ID barataa hin argamne. Step 1 irraa deebi'ii yaali." });
        }

        // 1. Emergency info save godhuu
        const newData = new ContactEmergency(data);
        await newData.save();

        // 2. Password uumuu
        const generatedPassword = crypto.randomBytes(4).toString('hex');
        const hashedPw = await bcrypt.hash(generatedPassword, 10);

        // 3. User update gochuu
        const updatedUser = await User.findOneAndUpdate(
            { studentId: data.universityId },
            {
                password: hashedPw,
                eName: data.eName || "",
                ePhone: data.ePhone || "",
                eRel: data.eRel || "",
                fName: data.fName || "",
                fPhone: data.fPhone || "",
                fRel: data.fRel || ""
            },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ error: "Barataan ID kanaan galmaa'e User collection keessa hin jiru." });
        }

        // 4. Email erguu
        if (updatedUser.email) {
            try {
                await sendPasswordEmail(updatedUser.email, generatedPassword);
            } catch (emailErr) {
    console.error("EMAIL ERROR:", emailErr);
}
        }

        res.status(200).json({ message: "Step 2 Milkaa'eera!" });

    } catch (err) {
        console.error("DATABASE ERROR:", err);
        // Error sirriin maali akka ta'e Alert irratti akka sitti himuuf:
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/skills', async (req, res) => {
    try {
        const { universityId, academicSkill, spiritualSkill, contribution } = req.body;

        if (!universityId) {
            return res.status(400).json({ message: "University ID is required." });
        }

        const updatedUser = await User.findOneAndUpdate(
            { studentId: universityId },
            {
                academicSkill: academicSkill || "",
                spiritualSkill: spiritualSkill || "",
                contribution: contribution || ""
            },
           { returnDocument: 'after' }
        );

        if (!updatedUser) {
            return res.status(404).json({ message: "Student not found." });
        }

        res.status(200).json({ message: "Skills saved successfully." });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { studentId, password } = req.body;
        const user = await User.findOne({ studentId });
        if (!user) return res.status(400).json({ message: "ID hin argamne!" });
        if (user.status !== 'active') return res.status(403).json({ message: "Admin mirkaneessuu eagi!" });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Password dogoggora!" });

        const token = jwt.sign(
            { userId: user._id, studentId: user.studentId, role: user.role },
            process.env.JWT_SECRET || "change_this_in_env",
            { expiresIn: "2h" }
        );

        res.json({ message: "Success", name: user.name, role: user.role, token });
    } catch (err) {
        res.status(500).json({ message: "Server Error" });
    }
});

app.get("/", (req, res) => res.send("Server is running ✅"));

const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
// 1. Barattoota hunda fiduuf (Agarsiisuu)
app.get('/api/admin/students', async (req, res) => {
    try {
        const students = await User.find().sort({ createdAt: -1 }); // Warra haaraa gubbaatti fida

        // Old records keessatti emergency/family data ContactEmergency keessa qofa yoo ta'e walitti maku
        const merged = await Promise.all(
            students.map(async (student) => {
                const plain = student.toObject();

                const hasEmergencyData = plain.eName || plain.ePhone || plain.fName || plain.fPhone;
                if (hasEmergencyData) return plain;

                const contact = await ContactEmergency.findOne({ universityId: plain.studentId }).lean();
                if (!contact) return plain;

                return {
                    ...plain,
                    eName: contact.eName || plain.eName,
                    ePhone: contact.ePhone || plain.ePhone,
                    eRel: contact.eRel || plain.eRel,
                    fName: contact.fName || plain.fName,
                    fPhone: contact.fPhone || plain.fPhone,
                    fRel: contact.fRel || plain.fRel
                };
            })
        );

        res.json(merged);
    } catch (err) {
        res.status(500).json({ message: "Ragaa fiduun hin danda'amne" });
    }
});

// 2. Barataa balleessuuf (Delete)
app.delete('/api/admin/delete/:id', async (req, res) => {
    try {
        const studentId = req.params.id;
        const deletedUser = await User.findOneAndDelete({ studentId: studentId });
        
        if (!deletedUser) {
            return res.status(404).json({ message: "Barataan hin argamne" });
        }
        res.json({ message: "Barataa ID " + studentId + " qabu haqameera!" });
    } catch (err) {
        res.status(500).json({ message: "Haqqii irratti rakkoon uumame" });
    }
});

app.put('/api/admin/approve', async (req, res) => {
    try {
        const studentId = req.query.studentId || req.body.studentId; 

        const updatedUser = await User.findOneAndUpdate(
            { studentId: studentId }, 
            { status: 'active' }, 
            { returnDocument: 'after' }
        );

        if (!updatedUser) {
            return res.status(404).json({ message: "Barataan hin argamne" });
        }

        // 👉 EMAIL yeroo approve
        if (updatedUser.email) {
            try {
                await sendPasswordEmail(updatedUser.email, "Your account is now active");
            } catch (err) {
                console.error("EMAIL ERROR:", err);
            }
        }

        res.json({ message: "Barataan mirkanaa'eera!", user: updatedUser });
    } catch (err) {
        res.status(500).json({ message: "Error: " + err.message });
    }
});
app.post('/api/admin/add-student', async (req, res) => {
    try {
        const { studentId, name, status } = req.body;
        // User schema keessatti password dirqama (required) waan ta'eef 
        // asirratti password feetaa tokko itti kennuun dirqama.
        const newUser = new User({
            studentId,
            name,
            password: "default123password", // Barataan booda jijjiirrata
            status: status || 'active'
        });
        sendPasswordEmail("daawudtamam@gmail.com", "test123")
    .then(() => console.log("✅ Email sent"))
    .catch(err => console.error("❌ Email error:", err));
        await newUser.save();
        res.status(200).json({ message: "Barataan galmaa'eera" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});