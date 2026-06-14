import axios from 'axios';

const API_URL = 'http://localhost:3000/api';

async function runBlackBoxTests() {
  console.log('🚀 Starting Black-Box Functional Tests...');
  let passed = 0;
  let failed = 0;

  const test = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`✅ PASSED: ${name}`);
      passed++;
    } catch (error: any) {
      console.error(`❌ FAILED: ${name}`);
      if (error.response) {
        console.error(`   Reason: ${error.response.status} ${JSON.stringify(error.response.data)}`);
      } else {
        console.error(`   Reason: ${error.message}`);
      }
      failed++;
    }
  };

  // Test 1: Health Check (Public)
  await test('Public Health Check', async () => {
    const res = await axios.get(`${API_URL}/health`);
    if (res.status !== 200 || res.data.status !== 'ok') {
      throw new Error('Health check failed');
    }
  });

  // Test 2: Unauthorized Access Protection
  await test('Authorization Protection (Should fail with 401)', async () => {
    try {
      await axios.get(`${API_URL}/farmers`);
      throw new Error('Access should have been denied');
    } catch (error: any) {
      if (error.response?.status !== 401) {
        throw error;
      }
    }
  });

  // Test 3: Invalid Database Context (Header test)
  await test('Error Handling - Missing Authentication (Black Box Validation)', async () => {
    try {
      await axios.post(`${API_URL}/sales`, { some: 'data' });
    } catch (error: any) {
      if (error.response?.status !== 401) {
        throw new Error('Should return 401 for unauthenticated sale recording');
      }
    }
  });

  console.log('\n--- Test Summary ---');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runBlackBoxTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
