require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 1. MONGODB SCHEMA & MODEL
// ==========================================
const donationSchema = new mongoose.Schema({
  donationId: { type: String, required: true, unique: true },
  drugDetails: {
    brandName: { type: String, required: true },
    genericName: { type: String, required: true },
    manufacturer: String,
    batchNumber: { type: String, required: true },
    expiryDate: { type: Date, required: true },
    diseaseCategory: String
  },
  inventory: {
    quantity: { type: Number, required: true },
    unitType: { type: String, default: 'Tablets' },
    estimatedRetailValueINR: Number
  },
  condition: {
    packaging: String,
    storageEnvironment: String,
    isSealIntact: { type: Boolean, required: true }
  },
  donor: {
    name: String,
    type: { type: String, enum: ['Physician Sample', 'Recovered Patient', 'Excess Purchase', 'Pharmacy Overstock', 'Hospital Inventory'] },
    contact: String
  },
  lifecycle: {
    status: { 
      type: String, 
      enum: ['Pending_Verification', 'Verified_Active', 'Rejected_Disposal', 'Dispatched'],
      default: 'Pending_Verification' 
    },
    submissionDate: { type: Date, default: Date.now },
    verifiedBy: String,
    verificationNotes: String
  }
});

const Donation = mongoose.model('Donation', donationSchema);

// ==========================================
// 2. REST API ROUTES
// ==========================================

// [POST] Add a new medicine donation (Triggered by Donor Form)
app.post('/api/donations', async (req, res) => {
  try {
    // Auto-generate a unique Donation ID
    const newDonationId = `DON-${Math.floor(1000 + Math.random() * 9000)}`;
    
    const newDonation = new Donation({
      donationId: newDonationId,
      ...req.body
    });

    const savedDonation = await newDonation.save();
    res.status(201).json({ 
      success: true, 
      message: 'Donation logged successfully for quality check.', 
      data: savedDonation 
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// [GET] Fetch donations (Triggered by Admin Dashboard)
// Supports querying: e.g., /api/donations?status=Pending_Verification
app.get('/api/donations', async (req, res) => {
  try {
    const filter = req.query.status ? { 'lifecycle.status': req.query.status } : {};
    const donations = await Donation.find(filter).sort({ 'lifecycle.submissionDate': -1 });
    
    res.status(200).json({ success: true, count: donations.length, data: donations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// [PATCH] Pharmacist Verification (Approve or Reject)
app.patch('/api/donations/:id/verify', async (req, res) => {
  try {
    const { action, notes, adminId } = req.body;
    
    // Determine new status based on Pharmacist action
    const newStatus = action === 'APPROVE' ? 'Verified_Active' : 'Rejected_Disposal';

    const updatedDonation = await Donation.findOneAndUpdate(
      { donationId: req.params.id },
      { 
        $set: { 
          'lifecycle.status': newStatus,
          'lifecycle.verifiedBy': adminId,
          'lifecycle.verificationNotes': notes
        } 
      },
      { new: true }
    );

    if (!updatedDonation) {
      return res.status(404).json({ success: false, message: 'Donation ID not found' });
    }

    res.status(200).json({ success: true, data: updatedDonation });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// [GET] Dashboard Analytics Summary
app.get('/api/analytics/summary', async (req, res) => {
  try {
    const pendingCount = await Donation.countDocuments({ 'lifecycle.status': 'Pending_Verification' });
    
    const inventoryStats = await Donation.aggregate([
      { $match: { 'lifecycle.status': 'Verified_Active' } },
      { $group: { _id: null, totalUnits: { $sum: '$inventory.quantity' }, totalValue: { $sum: '$inventory.estimatedRetailValueINR' } } }
    ]);

    const activeUnits = inventoryStats.length > 0 ? inventoryStats[0].totalUnits : 0;
    const activeValue = inventoryStats.length > 0 ? inventoryStats[0].totalValue : 0;

    res.status(200).json({
      success: true,
      data: { pendingCount, activeUnits, activeValue }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 3. SERVER INITIALIZATION
// ==========================================
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/medrelief';

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected successfully.');
    app.listen(PORT, () => console.log(`🚀 MedRelief API Server running on port ${PORT}`));
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));
