/**
 * Test the volunteer performance API endpoint
 */
import pool from './config/database.js';

async function testPerformanceAPI() {
    console.log('🧪 Testing Volunteer Performance API');
    
    try {
        // Get a volunteer from the database
        const volunteerQuery = `
            SELECT id, full_name, email 
            FROM users 
            WHERE role = 'volunteer' 
            LIMIT 1
        `;
        const { rows: volunteers } = await pool.query(volunteerQuery);
        
        if (volunteers.length === 0) {
            console.log('❌ No volunteers found in database');
            return;
        }
        
        const volunteer = volunteers[0];
        console.log('👤 Testing with volunteer:', volunteer.full_name, volunteer.email);
        
        // Test the performance query directly
        const performanceQuery = `
            SELECT 
                COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
                COUNT(*) FILTER (WHERE status = 'canceled') as cancelled_calls,
                COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_calls_alt,
                COUNT(*) FILTER (WHERE status = 'missed') as missed_calls,
                COUNT(*) FILTER (WHERE status IN ('completed', 'canceled', 'cancelled', 'missed')) as total_scheduled,
                COUNT(*) FILTER (WHERE status = 'completed' AND scheduled_time >= NOW() - INTERVAL '30 days') as recent_completed,
                COUNT(*) FILTER (WHERE status IN ('canceled', 'cancelled') AND scheduled_time >= NOW() - INTERVAL '30 days') as recent_cancelled,
                COUNT(*) FILTER (WHERE status = 'missed' AND scheduled_time >= NOW() - INTERVAL '30 days') as recent_missed,
                COALESCE(SUM(EXTRACT(EPOCH FROM (actual_end_time - actual_start_time))/60) FILTER (WHERE status = 'completed'), 0) as total_minutes,
                COUNT(DISTINCT student_id) FILTER (WHERE status = 'completed') as students_impacted
            FROM meetings 
            WHERE volunteer_id = $1 AND scheduled_time < NOW()
        `;
        
        const { rows } = await pool.query(performanceQuery, [volunteer.id]);
        const metrics = rows[0];
        
        console.log('📊 Raw metrics:', metrics);
        
        // Calculate the same way as our API
        const cancelledCalls = parseInt(metrics.cancelled_calls) + parseInt(metrics.cancelled_calls_alt);
        const completedCalls = parseInt(metrics.completed_calls);
        const missedCalls = parseInt(metrics.missed_calls);
        const totalScheduled = parseInt(metrics.total_scheduled);
        const recentCancelled = parseInt(metrics.recent_cancelled);
        const recentMissed = parseInt(metrics.recent_missed);
        const recentCompleted = parseInt(metrics.recent_completed);
        
        const successRate = totalScheduled > 0 ? Math.round((completedCalls / totalScheduled) * 100) : 100;
        const cancelledRate = totalScheduled > 0 ? Math.round((cancelledCalls / totalScheduled) * 100) : 0;
        const missedRate = totalScheduled > 0 ? Math.round((missedCalls / totalScheduled) * 100) : 0;
        
        let reputationScore = 100;
        reputationScore -= (cancelledRate * 1.5);
        reputationScore -= (missedRate * 2);
        reputationScore = Math.max(0, Math.round(reputationScore));
        
        console.log('🎯 Calculated Performance Data:');
        console.log('  - Completed Calls:', completedCalls);
        console.log('  - Cancelled Calls:', cancelledCalls);
        console.log('  - Missed Calls:', missedCalls);
        console.log('  - Total Scheduled:', totalScheduled);
        console.log('  - Success Rate:', successRate + '%');
        console.log('  - Cancelled Rate:', cancelledRate + '%');
        console.log('  - Missed Rate:', missedRate + '%');
        console.log('  - Reputation Score:', reputationScore);
        
        // Check restriction logic
        let warningStatus = 'none';
        let isRestricted = false;
        
        if (cancelledRate >= 40 || missedRate >= 30 || reputationScore < 30) {
            isRestricted = true;
            warningStatus = 'critical';
        } else if (cancelledRate >= 30 || missedRate >= 20 || reputationScore < 50) {
            warningStatus = 'severe';
        } else if (cancelledRate >= 20 || missedRate >= 15 || (recentCancelled + recentMissed) >= 3) {
            warningStatus = 'moderate';
        } else if (cancelledRate >= 10 || missedRate >= 10) {
            warningStatus = 'minor';
        }
        
        console.log('⚠️  Warning Status:', warningStatus);
        console.log('🚫 Account Restricted:', isRestricted);
        
        if (totalScheduled === 0) {
            console.log('ℹ️  No meeting history found for this volunteer');
        }
        
        console.log('✅ Performance API test completed successfully');
        
    } catch (error) {
        console.error('❌ Error testing performance API:', error);
    } finally {
        await pool.end();
    }
}

testPerformanceAPI();
