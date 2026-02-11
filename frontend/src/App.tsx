import { Routes, Route } from 'react-router-dom';
import { Box } from '@mui/material';
import { Layout } from './components';
import { Dashboard, Jobs, Encoders, OnlineEncoders, Analytics, DirectEncoding } from './pages';

function App() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/encoders" element={<Encoders />} />
          <Route path="/online-encoders" element={<OnlineEncoders />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/direct-encoding" element={<DirectEncoding />} />
        </Routes>
      </Layout>
    </Box>
  );
}

export default App;