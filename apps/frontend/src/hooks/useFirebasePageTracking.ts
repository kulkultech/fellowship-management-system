import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackFirebasePageView } from '@/lib/firebase';

export function useFirebasePageTracking() {
  const location = useLocation();

  useEffect(() => {
    trackFirebasePageView(location.pathname + location.search);
  }, [location.pathname, location.search]);
}
