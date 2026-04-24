import type { FlightItinerarySource } from '@koncie/types';
import { JetSeekerMockAdapter } from '@/adapters/jetseeker-mock';

/**
 * Single source of truth for the flight itinerary source. Every ingestion
 * call and server component imports `flightItinerarySource` from here — never
 * the adapter module directly. A later sprint swaps in a real Jet Seeker
 * wrapper by changing the imports below.
 */
export const flightItinerarySource: FlightItinerarySource = new JetSeekerMockAdapter();
