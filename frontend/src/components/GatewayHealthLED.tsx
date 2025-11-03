import { Box, Typography, Paper } from '@mui/material';

export type GatewayHealthStatus = 'healthy' | 'faulty' | 'dead';

interface GatewayHealthLEDProps {
  status: GatewayHealthStatus;
  size?: number;
}

export function GatewayHealthLED({ status, size = 180 }: GatewayHealthLEDProps) {
  const getStatusColor = (status: GatewayHealthStatus) => {
    switch (status) {
      case 'healthy': return '#4caf50';
      case 'faulty': return '#ff9800';
      case 'dead': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  const getStatusLabel = (status: GatewayHealthStatus) => {
    switch (status) {
      case 'healthy': return 'Healthy';
      case 'faulty': return 'Faulty';
      case 'dead': return 'Dead';
      default: return 'Unknown';
    }
  };

  const getStatusDescription = (status: GatewayHealthStatus) => {
    switch (status) {
      case 'healthy': return 'Gateway operating normally';
      case 'faulty': return 'Encoders bypassing gateway';
      case 'dead': return 'Gateway not responding';
      default: return '';
    }
  };

  const color = getStatusColor(status);
  const ledSize = size * 0.4; // LED takes 40% of total size

  return (
    <Paper elevation={3} sx={{ p: 2, width: size + 40, textAlign: 'center', height: '100%' }}>
      <Typography variant="h6" gutterBottom>
        Gateway Health
      </Typography>
      
      <Box 
        sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center',
          height: size,
          position: 'relative'
        }}
      >
        {/* LED Circle with glow effect */}
        <Box
          sx={{
            width: ledSize,
            height: ledSize,
            borderRadius: '50%',
            backgroundColor: color,
            boxShadow: `0 0 20px ${color}, 0 0 40px ${color}80, inset 0 0 10px rgba(255,255,255,0.3)`,
            border: `3px solid ${color}`,
            position: 'relative',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: '15%',
              left: '15%',
              width: '30%',
              height: '30%',
              backgroundColor: 'rgba(255, 255, 255, 0.6)',
              borderRadius: '50%',
              filter: 'blur(5px)'
            }
          }}
        />
      </Box>

      <Box sx={{ mt: 2 }}>
        <Typography 
          variant="h6" 
          sx={{ 
            color: color, 
            fontWeight: 'bold',
            mb: 1,
            textTransform: 'uppercase'
          }}
        >
          {getStatusLabel(status)}
        </Typography>
        
        <Typography variant="body2" color="text.secondary">
          {getStatusDescription(status)}
        </Typography>
      </Box>
    </Paper>
  );
}
