import { useState, type FormEvent } from 'react';
import { geocodeAddress } from '../lib/geocode';

type SearchResult = {
  lat: number;
  lon: number;
  districtName: string | null;
};

type AddressSearchProps = {
  onResult: (result: SearchResult) => void;
};

export default function AddressSearch({ onResult }: AddressSearchProps) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim() || searching) {
      return;
    }

    setSearching(true);
    setError('');

    try {
      const result = await geocodeAddress(query);
      if (!result) {
        setError('Address not found');
        return;
      }
      onResult({ lat: result.lat, lon: result.lon, districtName: null });
    } catch {
      setError('Search failed');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="address-search">
      <form onSubmit={(e) => void handleSubmit(e)} className="address-search-form">
        <input
          type="text"
          className="address-search-input"
          placeholder="Search address..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={searching}
        />
        <button type="submit" className="address-search-btn" disabled={searching || !query.trim()}>
          {searching ? '...' : 'Go'}
        </button>
      </form>
      {error ? <div className="address-search-error">{error}</div> : null}
    </div>
  );
}
