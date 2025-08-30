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
      console.log('Subscription created:', event.data.object);
      await handleSubscriptionCreated(event.data.object);
      break;
    
    case 'customer.subscription.updated':
      console.log('Subscription updated:', event.data.object);
      await handleSubscriptionUpdated(event.data.object);
      break;
    
    case 'customer.subscription.deleted':
      console.log('Subscription cancelled:', event.data.object);
      await handleSubscriptionCancelled(event.data.object);
      break;
    
    case 'invoice.payment_succeeded':
      console.log('Payment succeeded:', event.data.object);
      await handlePaymentSucceeded(event.data.object);
      break;
    
    case 'invoice.payment_failed':
      console.log('Payment failed:', event.data.object);
      await handlePaymentFailed(event.data.object);
      break;
    
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// Firebase helper functions
async function handleSubscriptionCreated(subscription) {
  try {
    const db = admin.firestore();
    await db.collection('subscriptions').doc(subscription.id).set({
      customerId: subscription.customer,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      createdAt: new Date(),
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('Error handling subscription created:', error);
  }
}

async function handleSubscriptionUpdated(subscription) {
  try {
    const db = admin.firestore();
    await db.collection('subscriptions').doc(subscription.id).update({
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('Error handling subscription updated:', error);
  }
}

async function handleSubscriptionCancelled(subscription) {
  try {
    const db = admin.firestore();
    await db.collection('subscriptions').doc(subscription.id).update({
      status: 'cancelled',
      cancelledAt: new Date(),
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('Error handling subscription cancelled:', error);
  }
}

async function handlePaymentSucceeded(invoice) {
  try {
    const db = admin.firestore();
    await db.collection('payments').doc(invoice.id).set({
      customerId: invoice.customer,
      subscriptionId: invoice.subscription,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: 'succeeded',
      paidAt: new Date(invoice.status_transitions.paid_at * 1000),
      createdAt: new Date()
    });
  } catch (error) {
    console.error('Error handling payment succeeded:', error);
  }
}

async function handlePaymentFailed(invoice) {
  try {
    const db = admin.firestore();
    await db.collection('payments').doc(invoice.id).set({
      customerId: invoice.customer,
      subscriptionId: invoice.subscription,
      amount: invoice.amount_due,
      currency: invoice.currency,
      status: 'failed',
      failedAt: new Date(),
      createdAt: new Date()
    });
  } catch (error) {
    console.error('Error handling payment failed:', error);
  }
}

app.listen(PORT, () => {
  console.log(`NotanPro Webhook Server running on port ${PORT}`);
});
