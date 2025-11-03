import { Box, Typography, Paper } from '@mui/material';

export interface WorkloadData {
  ratio: number;
  zone: 'green' | 'yellow' | 'red';
  activeJobs: number;
  activeEncoders: number;
  oldJobsDetected: boolean;
}

interface WorkloadGaugeProps {
  data: WorkloadData;
  size?: number;
}

export function WorkloadGauge({ data, size = 150 }: WorkloadGaugeProps) {
  const { ratio, zone, activeJobs, activeEncoders, oldJobsDetected } = data;

  // Calculate angle for the needle (0-180 degrees for semicircle)
  // Green LEFT (0°), Yellow middle (60-120°), Red RIGHT (180°)
  const getNeedleAngle = (ratio: number) => {
    if (ratio <= 2) {
      // Green zone: 0-60 degrees (pointing left)
      return Math.min((ratio / 2) * 60, 60);
    } else if (ratio <= 4) {
      // Yellow zone: 60-120 degrees  
      return 60 + ((ratio - 2) / 2) * 60;
    } else {
      // Red zone: 120-180 degrees (pointing right)
      return Math.min(120 + ((ratio - 4) / 6) * 60, 180);
    }
  };

  const needleAngle = getNeedleAngle(ratio);
  const radius = size / 2;
  const centerX = radius;
  const centerY = radius;

  // Zone colors
  const getZoneColor = (zone: string) => {
    switch (zone) {
      case 'green': return '#4caf50';
      case 'yellow': return '#ff9800';
      case 'red': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  const getZoneLabel = (zone: string) => {
    switch (zone) {
      case 'green': return 'OPTIMAL';
      case 'yellow': return 'BUSY';
      case 'red': return 'OVERLOADED';
      default: return 'UNKNOWN';
    }
  };

  // SVG path for semicircle zones - Fixed to follow the gauge curve properly
  const createArc = (startAngle: number, endAngle: number, color: string) => {
    const start = (startAngle * Math.PI) / 180;
    const end = (endAngle * Math.PI) / 180;
    const outerRadius = radius - 10;
    const innerRadius = radius - 25;
    
    // Mirror the arc by using (Math.PI - angle) instead of (Math.PI + angle)
    const x1 = centerX - outerRadius * Math.cos(start);
    const y1 = centerY - outerRadius * Math.sin(start);
    const x2 = centerX - outerRadius * Math.cos(end);
    const y2 = centerY - outerRadius * Math.sin(end);
    
    const x3 = centerX - innerRadius * Math.cos(end);
    const y3 = centerY - innerRadius * Math.sin(end);
    const x4 = centerX - innerRadius * Math.cos(start);
    const y4 = centerY - innerRadius * Math.sin(start);
    
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
    
    return (
      <path
        d={`M ${x1} ${y1} 
           A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2} ${y2}
           L ${x3} ${y3}
           A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4} Z`}
        fill={color}
      />
    );
  };

  // Needle position - mirrored to match the arc orientation
  const needleLength = radius - 30;
  const needleRad = (needleAngle * Math.PI) / 180;
  const needleX = centerX - needleLength * Math.cos(needleRad);
  const needleY = centerY - needleLength * Math.sin(needleRad);

  return (
    <Paper elevation={3} sx={{ p: 2, width: size + 40, textAlign: 'center' }}>
      <Typography variant="h6" gutterBottom>
        Workload Monitor
      </Typography>
      
      <Box sx={{ position: 'relative', display: 'inline-block' }}>
        <svg width={size} height={radius + 20}>
          {/* Background semicircle */}
          <path
            d={`M 10 ${centerY} A ${radius - 10} ${radius - 10} 0 0 1 ${size - 10} ${centerY}`}
            fill="none"
            stroke="#e0e0e0"
            strokeWidth="15"
          />
          
          {/* Zone arcs - Green LEFT, Red RIGHT */}
          {createArc(0, 60, '#4caf50')}    {/* Green */}
          {createArc(60, 120, '#ff9800')}  {/* Yellow */}
          {createArc(120, 180, '#f44336')} {/* Red */}
          
          {/* Zone markers */}
          <line x1={centerX} y1="15" x2={centerX} y2="35" stroke="#666" strokeWidth="2" />
          
          {/* Needle */}
          <line
            x1={centerX}
            y1={centerY}
            x2={needleX}
            y2={needleY}
            stroke="#333"
            strokeWidth="3"
            strokeLinecap="round"
          />
          
          {/* Center dot */}
          <circle
            cx={centerX}
            cy={centerY}
            r="5"
            fill="#333"
          />
          
          {/* Zone labels */}
          <text x="25" y={centerY + 15} fontSize="10" fill="#4caf50" textAnchor="middle">GREEN</text>
          <text x={centerX} y="10" fontSize="10" fill="#ff9800" textAnchor="middle">YELLOW</text>
          <text x={size - 25} y={centerY + 15} fontSize="10" fill="#f44336" textAnchor="middle">RED</text>
        </svg>
      </Box>

      <Box sx={{ mt: 2 }}>
        <Typography 
          variant="h6" 
          sx={{ 
            color: getZoneColor(zone), 
            fontWeight: 'bold',
            mb: 1 
          }}
        >
          {getZoneLabel(zone)}
        </Typography>
        
        <Typography variant="body2" color="text.secondary">
          Ratio: {ratio.toFixed(1)} ({activeJobs} jobs / {activeEncoders} encoders)
        </Typography>
        
        {oldJobsDetected && (
          <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
            ⚠️ Old unassigned jobs detected
          </Typography>
        )}
      </Box>
    </Paper>
  );
}