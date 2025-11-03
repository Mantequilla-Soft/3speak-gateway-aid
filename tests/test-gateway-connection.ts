/**
 * Test file for gateway connection and DID key authentication
 * Based on the encoder client logic shared
 */

import axios from 'axios';

// Mock JWS creation for testing (real implementation would use proper DID key cryptography)
function createMockJWS(payload: any, didKey: string): string {
  const header = { 
    alg: 'EdDSA', 
    typ: 'JWT',
    kid: didKey 
  };
  
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = Buffer.from(`mock_signature_${Date.now()}`).toString('base64url');
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

interface NodeInfo {
  encoder_id: string;
  name: string;
  description: string;
  location?: string;
  hardware_type?: string;
  version: string;
}

async function testGatewayConnection() {
  const gatewayUrl = 'https://encoder.3speak.tv/api/v0';
  const didKey = 'did:key:z6Mkp91YfuyqZTEx3HAxb5gQuEgnwFktUR4gDod4p31wXJev';
  
  console.log('🔍 Testing Gateway Connection...');
  console.log(`Gateway URL: ${gatewayUrl}`);
  console.log(`DID Key: ${didKey}`);

  const client = axios.create({
    baseURL: gatewayUrl,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': '3Speak-Gateway-Monitor/1.0.0'
    }
  });

  try {
    // 1. Test basic connectivity - try to get gateway stats
    console.log('\n📊 Testing gateway stats endpoint...');
    try {
      const statsResponse = await client.get('/gateway/stats');
      console.log('✅ Gateway stats accessible:', statsResponse.status);
      console.log('📋 Stats data:', JSON.stringify(statsResponse.data, null, 2));
    } catch (error: any) {
      console.log('⚠️ Gateway stats failed:', error.response?.status, error.message);
      if (error.response?.data) {
        console.log('📋 Error data:', error.response.data);
      }
    }

    // 2. Test node registration with DID key
    console.log('\n🔐 Testing node registration...');
    const nodeInfo: NodeInfo = {
      encoder_id: didKey,
      name: 'Gateway Monitor',
      description: 'Health monitoring and status checking service for 3Speak encoding infrastructure',
      location: 'Monitoring Service',
      hardware_type: 'virtual',
      version: '1.0.0'
    };

    const jws = createMockJWS({ node_info: nodeInfo }, didKey);
    
    try {
      const registerResponse = await client.post('/gateway/updateNode', { jws });
      console.log('✅ Node registration successful:', registerResponse.status);
      console.log('📋 Registration response:', JSON.stringify(registerResponse.data, null, 2));
    } catch (error: any) {
      console.log('⚠️ Node registration failed:', error.response?.status, error.message);
      if (error.response?.data) {
        console.log('📋 Error data:', error.response.data);
      }
    }

    // 3. Test job polling (should return 404 - no jobs for monitor)
    console.log('\n📋 Testing job polling...');
    try {
      const jobResponse = await client.get('/gateway/getJob');
      console.log('✅ Job polling accessible:', jobResponse.status);
      console.log('📋 Job data:', JSON.stringify(jobResponse.data, null, 2));
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log('✅ Job polling working (404 - no jobs available as expected)');
      } else {
        console.log('⚠️ Job polling failed:', error.response?.status, error.message);
        if (error.response?.data) {
          console.log('📋 Error data:', error.response.data);
        }
      }
    }

  } catch (error: any) {
    console.error('❌ Gateway connection test failed:', error.message);
  }
}

// Run the test
if (require.main === module) {
  testGatewayConnection()
    .then(() => console.log('\n🏁 Gateway connection test completed'))
    .catch(err => console.error('💥 Test runner error:', err));
}

export { testGatewayConnection };