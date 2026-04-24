const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

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
    gender: { type: String, enum: ['Male', 'Female', ''], default: '' },
    profilePic: { type: String, default: '' },
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

function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
        return res.status(401).json({ message: 'Authentication token is required.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "change_this_in_env");
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token.' });
    }
}

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
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        throw new Error('Email credentials are missing in .env');
    }

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: userEmail,
        subject: 'AUWCMSJ Password',
        text: `Baga nagaan dhufte! Password kee: ${generatedPassword}`
    };
    return transporter.sendMail(mailOptions);
};
const resourceSchema = new mongoose.Schema({
    title: String,
    category: String,
    fileName: String,
    fileUrl: String // 👉 kana dabaluu
});
const Resource = mongoose.model('Resource', resourceSchema);

// ADD
app.post('/api/admin/resources', async (req, res) => {
    try {
        const newRes = new Resource(req.body);
        await newRes.save();
        res.json({ message: "Uploaded" });
    } catch (err) {
        res.status(500).json({ message: "Upload failed" });
    }
});

// GET (user)
app.get('/api/resources', async (req, res) => {
    const data = await Resource.find();
    res.json(data);
});

// 4. API ENDPOINTS
app.post('/api/register-step1', async (req, res) => {
    try {
        const universityId = String(req.body.universityId || '').trim();
        const email = String(req.body.email || '').trim();
        const fullName = String(req.body.fullName || '').trim();
        const gender = String(req.body.gender || '').trim();
        const existing = await User.findOne({ studentId: universityId });
        if (existing) return res.status(400).json({ message: "ID is already registered!" });

        const newUser = new User({
            studentId: universityId,
            name: fullName,
            email: email,
            gender: gender === 'Male' || gender === 'Female' ? gender : '',
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
        let emailSent = false;
        let emailError = "";
        if (updatedUser.email) {
            try {
                await sendPasswordEmail(updatedUser.email, generatedPassword);
                emailSent = true;
            } catch (emailErr) {
                console.error("EMAIL ERROR:", emailErr);
                emailError = emailErr.message || "Password email could not be sent.";
            }
        } else {
            emailError = "No email address was saved for this user.";
        }

        res.status(200).json({
            message: "Step 2 Milkaa'eera!",
            emailSent,
            emailError,
            generatedPassword: emailSent ? undefined : generatedPassword
        });

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
        const studentId = String(req.body.studentId || '').trim();
        const password = String(req.body.password || '').trim();

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

        res.json({
            message: "Success",
            name: user.name,
            role: user.role,
            studentId: user.studentId,
            profilePic: user.profilePic || "",
            token
        });
    } catch (err) {
        res.status(500).json({ message: "Server Error" });
    }
});

app.get('/api/user/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('name studentId email profilePic');
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.json(user);
    } catch (err) {
        res.status(500).json({ message: 'User profile could not be loaded.' });
    }
});

app.put('/api/user/profile-photo', authenticateToken, async (req, res) => {
    try {
        const profilePic = String(req.body.profilePic || '').trim();

        if (!profilePic) {
            return res.status(400).json({ message: 'Profile image is required.' });
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user.userId,
            { profilePic },
            { new: true }
        ).select('profilePic');

        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.json({ message: 'Profile photo updated.', profilePic: updatedUser.profilePic || '' });
    } catch (err) {
        res.status(500).json({ message: 'Profile photo could not be updated.' });
    }
});

app.put('/api/user/change-password', authenticateToken, async (req, res) => {
    try {
        const currentPassword = String(req.body.currentPassword || '').trim();
        const newPassword = String(req.body.newPassword || '').trim();

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Current password and new password are required.' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'New password must be at least 6 characters.' });
        }

        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect.' });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        res.json({ message: 'Password changed successfully.' });
    } catch (err) {
        res.status(500).json({ message: 'Password could not be changed.' });
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

async function approveStudentHandler(req, res) {
    try {
        const studentId = String(req.query.studentId || req.body?.studentId || '').trim();

        if (!studentId) {
            return res.status(400).json({ message: "Student ID is required." });
        }

        const updatedUser = await User.findOneAndUpdate(
            { studentId: studentId }, 
            { status: 'active' }, 
            { new: true }
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
}

app.put('/api/admin/approve', approveStudentHandler);
app.post('/api/admin/approve', approveStudentHandler);

// Block member endpoint
app.post('/api/admin/block', async (req, res) => {
    try {
        const studentId = String(req.body.studentId || '').trim();

        if (!studentId) {
            return res.status(400).json({ message: "Student ID is required." });
        }

        const updatedUser = await User.findOneAndUpdate(
            { studentId: studentId }, 
            { status: 'blocked' }, 
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ message: "Barataan hin argamne" });
        }

        res.json({ message: "Member blocked successfully!", user: updatedUser });
    } catch (err) {
        res.status(500).json({ message: "Error: " + err.message });
    }
});
app.post('/api/admin/add-student', async (req, res) => {
    try {
        const studentId = String(req.body.studentId || '').trim();
        const name = String(req.body.name || '').trim();
        const password = String(req.body.password || '').trim();
        const status = req.body.status;

        if (!studentId || !name || !password) {
            return res.status(400).json({ error: "Student ID, name, and password are required." });
        }

        const existingUser = await User.findOne({ studentId });
        if (existingUser) {
            return res.status(400).json({ error: "Student ID already exists." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            studentId,
            name,
            password: hashedPassword,
            status: status || 'active'
        });

        await newUser.save();
        res.status(200).json({ message: "Barataan galmaa'eera" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
let latestNews = "Beeksisni ammaan tana hin jiru.";

app.post('/api/admin/news', (req, res) => {
    latestNews = req.body.news;
    res.json({ message: "News updated" });
});

app.get('/api/news', (req, res) => {
    res.json({ news: latestNews });
});
app.get('/api/statistics', async (req, res) => {
    try {
        const students = await User.find({ role: 'student' }).select('gender status').lean();
        const total = students.length;
        const active = students.filter(student => student.status === 'active').length;
        const male = students.filter(student => student.gender === 'Male').length;
        const female = students.filter(student => student.gender === 'Female').length;

        res.json({ total, active, male, female });
    } catch (err) {
        res.status(500).json({ message: "Statistics hin fe'amne" });
    }
});
// PROGRESS
app.post('/api/progress', (req, res) => {
    try {
        const progressFile = path.join(__dirname, 'progress.json');
        const student = String(req.body.student || '').trim();
        const level = String(req.body.level || '').trim();
        const detail = String(req.body.detail || '').trim();

        if (!student || !level || !detail) {
            return res.status(400).json({ message: "Student, level, and detail are required." });
        }

        const progress = {
            student,
            level,
            detail,
            createdAt: new Date().toISOString()
        };

        let all = [];

        if (fs.existsSync(progressFile)) {
            const data = fs.readFileSync(progressFile, 'utf8');
            const parsed = JSON.parse(data);
            all = Array.isArray(parsed) ? parsed : [];
        }

        all.push(progress);

        fs.writeFileSync(progressFile, JSON.stringify(all, null, 2));

        res.json({ message: "Saved" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Progress hin save goone" });
    }
});

app.get('/api/progress', (req, res) => {
    try {
        const progressFile = path.join(__dirname, 'progress.json');

        if (!fs.existsSync(progressFile)) {
            return res.json([]);
        }

        const data = fs.readFileSync(progressFile, 'utf8');
        const parsed = JSON.parse(data);
        const rows = Array.isArray(parsed) ? parsed : [];

        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Progress hin fe'amne" });
    }
});

app.delete('/api/progress/:index', (req, res) => {
    try {
        const progressFile = path.join(__dirname, 'progress.json');
        const index = Number(req.params.index);

        if (!Number.isInteger(index) || index < 0) {
            return res.status(400).json({ message: "Valid progress index is required." });
        }

        if (!fs.existsSync(progressFile)) {
            return res.status(404).json({ message: "Progress file not found." });
        }

        const data = fs.readFileSync(progressFile, 'utf8');
        let rows = [];

        try {
            rows = JSON.parse(data);
        } catch {
            rows = [];
        }

        if (!Array.isArray(rows) || index >= rows.length) {
            return res.status(404).json({ message: "Progress entry not found." });
        }

        rows.splice(index, 1);
        fs.writeFileSync(progressFile, JSON.stringify(rows, null, 2));
        res.json({ message: "Progress deleted successfully." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Progress delete hin danda'amne" });
    }
});

// Delete user profile photo endpoint
app.delete('/api/user/delete-profile-photo', async (req, res) => {
    try {
        console.log('Delete profile photo request received:', req.body);
        const { studentId } = req.body;

        if (!studentId) {
            console.log('Student ID missing');
            return res.status(400).json({ message: "Student ID is required." });
        }

        console.log('Looking for user with studentId:', studentId.trim());
        // Find the user
        const user = await User.findOne({ studentId: studentId.trim() });
        
        if (!user) {
            console.log('User not found');
            return res.status(404).json({ message: "User not found." });
        }

        console.log('User found, deleting profile photo...');
        // Remove profile photo from user record
        await User.updateOne(
            { studentId: studentId.trim() },
            { $unset: { profilePic: 1 } }
        );

        console.log('Profile photo deleted, sending response');
        const response = { message: "Profile photo deleted successfully." };
        console.log('Sending JSON response:', response);
        res.json(response);
    } catch (err) {
        console.error("Profile photo deletion error:", err);
        res.status(500).json({ message: "Error deleting profile photo: " + err.message });
    }
});

// Change user role endpoint
app.put('/api/admin/change-role', async (req, res) => {
    try {
        const { studentId, newRole } = req.body;

        if (!studentId || !newRole) {
            return res.status(400).json({ message: "Student ID and new role are required." });
        }

        // Validate role
        const validRoles = ['student', 'admin', 'teacher'];
        if (!validRoles.includes(newRole)) {
            return res.status(400).json({ message: "Invalid role. Must be student, admin, or teacher." });
        }

        // Find the user
        const user = await User.findOne({ studentId: studentId.trim() });
        
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        // Update user role
        await User.updateOne(
            { studentId: studentId.trim() },
            { role: newRole }
        );

        console.log(`Role changed for ${studentId} to ${newRole}`);
        res.json({ message: `Role changed to ${newRole} successfully.` });
    } catch (err) {
        console.error("Role change error:", err);
        res.status(500).json({ message: "Error changing role: " + err.message });
    }
});

// Update user information endpoint
app.put('/api/admin/update-user', async (req, res) => {
    try {
        const { studentId, name, email, status, role } = req.body;

        if (!studentId) {
            return res.status(400).json({ message: "Student ID is required." });
        }

        // Find the user
        const user = await User.findOne({ studentId: studentId.trim() });
        
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        // Prepare update data
        const updateData = {};
        if (name) updateData.name = name.trim();
        if (email) updateData.email = email.trim();
        if (status) updateData.status = status;
        if (role) updateData.role = role;

        // Update user information
        await User.updateOne(
            { studentId: studentId.trim() },
            updateData
        );

        console.log(`User information updated for ${studentId}:`, updateData);
        res.json({ message: "User information updated successfully." });
    } catch (err) {
        console.error("Update user error:", err);
        res.status(500).json({ message: "Error updating user information: " + err.message });
    }
});
