const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'synthetic-test-secret';

const app = require('../server');
const User = require('../src/models/User');

let mongo;
let seller;
let sellerToken;

function tokenFor(user) {
  return jwt.sign(
    { userId: String(user._id), username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  seller = await User.create({
    username: 'synthetic-seller-audit',
    email: 'synthetic-audit@example.test',
    password: 'synthetic-test-password'
  });
  sellerToken = tokenFor(seller);

  // Activate Seller Free plan so commercial/free listings can be posted
  await request(app)
    .post('/api/marketplace/seller/subscribe')
    .set('Authorization', `Bearer ${sellerToken}`)
    .send({})
    .expect(201);
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
}, 30000);

describe('Synthetic Listing Lifecycle (POST create -> PATCH /:id -> GET /:id)', () => {
  let createdListingId;

  test('Step 1: POST /api/listings/create succeeds and returns new listing ID', async () => {
    const createPayload = {
      title: 'Synthetic Test Item Original',
      category: 'tools',
      currency: 'FREE',
      price: 0,
      description: 'Initial synthetic description for verification'
    };

    const res = await request(app)
      .post('/api/listings/create')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send(createPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.listing).toBeDefined();
    expect(res.body.listing.title).toBe('Synthetic Test Item Original');
    expect(res.body.listing.id).toBeDefined();

    createdListingId = res.body.listing.id;
  });

  test('Step 2: PATCH /api/listings/:id updates title and description', async () => {
    expect(createdListingId).toBeDefined();

    const patchPayload = {
      title: 'Synthetic Test Item Patched',
      description: 'Updated synthetic description verified via PATCH /:id'
    };

    const res = await request(app)
      .patch(`/api/listings/${createdListingId}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send(patchPayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.listing).toBeDefined();
    expect(res.body.listing.id).toBe(createdListingId);
    expect(res.body.listing.title).toBe('Synthetic Test Item Patched');
    expect(res.body.listing.description).toBe('Updated synthetic description verified via PATCH /:id');
  });

  test('Step 3: GET /api/listings/:id retrieves updated listing details', async () => {
    expect(createdListingId).toBeDefined();

    const res = await request(app)
      .get(`/api/listings/${createdListingId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.listing).toBeDefined();
    expect(res.body.listing.id).toBe(createdListingId);
    expect(res.body.listing.title).toBe('Synthetic Test Item Patched');
    expect(res.body.listing.description).toBe('Updated synthetic description verified via PATCH /:id');
  });
});
