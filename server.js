const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const admin = require('firebase-admin');
const cors = require('cors');

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert({
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
  }),
  projectId: process.env.FIREBASE_PROJECT_ID
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'NotanPro Webhook Server is running',
    timestamp: new Date().toISOString()
  });
});

// Stripe webhook endpoint
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'customer.subscription.created':
      console.log('Subscription created:', event.data.object.id);
      await logSubscription(event.data.object);
      break;
    
    case 'invoice.payment_succeeded':
      console.log('Payment succeeded:', event.data.object.id);
      await logPayment(event.data.object);
      break;
    
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// Simple logging functions
async function logSubscription(subscription) {
  try {
    const db = admin.firestore();
    await db.collection('webhook_subscriptions').add({
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      status: subscription.status,
      amount: subscription.items.data[0]?.price?.unit_amount || 0,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('Subscription logged to Firebase');
  } catch (error) {
    console.error('Error logging subscription:', error);
  }
}

async function logPayment(invoice) {
  try {
    const db = admin.firestore();
    await db.collection('webhook_payments').add({
      invoiceId: invoice.id,
      customerId: invoice.customer,
      subscriptionId: invoice.subscription || null,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('Payment logged to Firebase');
  } catch (error) {
    console.error('Error logging payment:', error);
  }
}

app.listen(PORT, () => {
  console.log(`NotanPro Webhook Server running on port ${PORT}`);
});
