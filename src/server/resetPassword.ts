import { Router } from 'express';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const router = Router();

// Initialize Firebase Admin (credentials should be in environment variables)
const adminApp = initializeApp({
  credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}'))
});

const adminAuth = getAuth(adminApp);
const adminDb = getFirestore(adminApp);

/**
 * POST /api/resetPassword
 * Handles password reset requests
 * 
 * Body: { email: string }
 * 
 * Returns:
 * - 200: Password reset email sent successfully
 * - 400: Invalid email or user not found
 * - 500: Server error
 */
router.post('/resetPassword', async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email format
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({
        error: 'Voer een geldig e-mailadres in.'
      });
    }

    const normalizedEmail = email.toLowerCase();

    // Query Firestore to find user with this email
    const usersRef = adminDb.collection('users');
    const query = usersRef.where('email', '==', normalizedEmail);
    const snapshot = await query.get();

    // Check if user exists
    if (snapshot.empty) {
      return res.status(400).json({
        error: 'Dit e-mailadres is niet geregistreerd in het systeem.'
      });
    }

    // Check if user is a ZZP
    let isZZP = false;
    snapshot.forEach((doc) => {
      const userData = doc.data();
      if (userData.role === 'zzp') {
        isZZP = true;
      }
    });

    if (!isZZP) {
      return res.status(400).json({
        error: 'Alleen ZZP gebruikers kunnen hun wachtwoord resetten via deze pagina.'
      });
    }

    // Send password reset email using Firebase Admin SDK
    // This uses the email address to identify the user in Firebase Auth
    try {
      await adminAuth.sendPasswordResetEmail(normalizedEmail);
      
      return res.status(200).json({
        success: true,
        message: 'Wachtwoord reset email verzonden.'
      });
    } catch (authError: any) {
      console.error('Firebase Auth error:', authError);
      
      // User exists in Firestore but not in Firebase Auth
      if (authError.code === 'auth/user-not-found') {
        return res.status(400).json({
          error: 'Dit e-mailadres is niet gekoppeld aan een Firebase-account.'
        });
      }
      
      return res.status(500).json({
        error: 'Er is een fout opgetreden bij het verzenden van de reset email.'
      });
    }
  } catch (error: any) {
    console.error('Password reset error:', error);
    return res.status(500).json({
      error: 'Er is een fout opgetreden. Probeer het later opnieuw.'
    });
  }
});

export default router;
