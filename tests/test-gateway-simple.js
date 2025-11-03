/**
 * Simple gateway connection test
 * Run with: node tests/test-gateway-simple.js
 */

import axios from 'axios';

const GATEWAY_URL = 'https://encoder.3speak.tv/api/v0';
const DID_KEY = 'did:key:z6Mkp91YfuyqZTEx3HAxb5gQuEgnwFktUR4gDod4p31wXJev';

async function testGateway() {
  console.log('🔍 Testing Gateway Connection...');
  console.log(`Gateway URL: ${GATEWAY_URL}`);
  console.log(`DID Key: ${DID_KEY}`);

  const client = axios.create({
    baseURL: GATEWAY_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': '3Speak-Gateway-Monitor/1.0.0'
    }
  });

  // Test 1: Basic connectivity
  console.log('\n📊 Testing gateway stats...');
  try {
    const response = await client.get('/gateway/stats');
    console.log('✅ Gateway stats SUCCESS:', response.status);
    console.log('📋 Stats:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Gateway stats FAILED:', error.response?.status || error.code, error.message);
    if (error.response?.data) {
      console.log('📋 Error data:', error.response.data);
    }
  }

  // Test 2: Job polling (should be 404 for monitor)  
  console.log('\n📋 Testing job polling...');
  try {
    const response = await client.get('/gateway/getJob');
    console.log('✅ Job polling response:', response.status);
    console.log('📋 Job data:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('✅ Job polling OK (404 - no jobs for monitor)');
    } else {
      console.log('❌ Job polling FAILED:', error.response?.status || error.code, error.message);
    }
  }

  console.log('\n🏁 Gateway test completed');
}

testGateway().catch(console.error);