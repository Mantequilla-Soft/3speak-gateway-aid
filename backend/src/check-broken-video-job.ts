/**
 * Check when the broken video's job was completed
 */

import * as dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();

async function checkBrokenVideoJob() {
  const connectionString = process.env.MONGODB_URI;
  
  if (!connectionString) {
    console.error('❌ MONGODB_URI not found');
    process.exit(1);
  }

  const client = new MongoClient(connectionString);

  try {
    await client.connect();
    console.log('\n=== Checking Broken Video Job ===\n');

    // Find the recent broken video
    const threespeakDb = client.db('threespeak');
    const videosCollection = threespeakDb.collection('videos');
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const brokenVideo = await videosCollection.findOne({
      status: 'published',
      created: { $gte: oneDayAgo },
      $or: [
        { video_v2: { $exists: false } },
        { video_v2: null },
        { video_v2: '' }
      ]
    });

    if (!brokenVideo) {
      console.log('❌ No recent broken video found');
      return;
    }

    console.log('🔍 Found broken video:');
    console.log(`   Owner: ${brokenVideo.owner}`);
    console.log(`   Permlink: ${brokenVideo.permlink}`);
    console.log(`   Created: ${brokenVideo.created}`);
    console.log('');

    // Find the corresponding job
    const gatewayDb = client.db('spk-encoder-gateway');
    const jobsCollection = gatewayDb.collection('jobs');
    
    const job = await jobsCollection.findOne({
      owner: brokenVideo.owner,
      permlink: brokenVideo.permlink,
      status: 'completed'
    });

    if (!job) {
      console.log('❌ No completed job found for this video');
      console.log('   This means the video exists but no encoder job completed it');
      return;
    }

    console.log('✅ Found corresponding job:');
    console.log(`   Job ID: ${job._id}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Created: ${job.created_at}`);
    console.log(`   Completed: ${job.completed_at || 'NOT SET'}`);
    console.log(`   CID: ${job.encode_job.cid || 'NOT SET'}`);
    console.log('');

    if (job.completed_at) {
      const completedDate = new Date(job.completed_at);
      const now = new Date();
      const hoursAgo = (now.getTime() - completedDate.getTime()) / (1000 * 60 * 60);
      
      console.log(`⏱️  Job was completed ${hoursAgo.toFixed(2)} hours ago`);
      
      if (hoursAgo > 1) {
        console.log(`   ⚠️  This is WHY the healer didn't find it!`);
        console.log(`   Healer only checks jobs completed in the last 1 hour`);
        console.log(`   You need to either:`);
        console.log(`   1. Increase lookback period temporarily`);
        console.log(`   2. Wait for next similar job to test`);
        console.log(`   3. Manually heal this video`);
      } else {
        console.log(`   ✅ This should have been caught by the healer`);
        console.log(`   There might be another issue...`);
      }
    } else {
      console.log('⚠️  Job has no completed_at timestamp');
      console.log('   This might be why healer couldn\'t find it');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

checkBrokenVideoJob();
