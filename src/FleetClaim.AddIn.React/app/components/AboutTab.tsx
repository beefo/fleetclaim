import React from 'react';
import { Card, Cards } from '@geotab/zenith';
import { useGeotab } from '@/contexts';

export const AboutTab: React.FC = () => {
    const { session } = useGeotab();

    return (
        <div className="about-tab">
            <Cards>
                <Card size="L" title="FleetClaim">
                    <Card.Content>
                        <div className="about-description">
                            <p>
                                FleetClaim automatically collects and packages evidence when a vehicle
                                collision is detected, giving fleet managers a complete incident report
                                within minutes — not days.
                            </p>

                            <h4>How it works</h4>
                            <p>
                                When a Geotab telematics device detects a collision event (hard braking,
                                impact, or rollover), FleetClaim automatically gathers:
                            </p>
                            <ul>
                                <li><strong>GPS trail</strong> — Vehicle path before and after the incident with an interactive map</li>
                                <li><strong>Speed & acceleration data</strong> — Speeds, G-forces, and deceleration at the moment of impact</li>
                                <li><strong>Weather conditions</strong> — Temperature, precipitation, visibility, and road conditions at the time and location</li>
                                <li><strong>Vehicle diagnostics</strong> — Engine status, fuel level, seatbelt state, ABS/traction control activation, and any active fault codes</li>
                                <li><strong>Driver information</strong> — Assigned driver, hours-of-service status, and recent safety history</li>
                                <li><strong>Photos</strong> — Upload and attach scene photos, vehicle damage, and documentation directly from the report</li>
                            </ul>
                            <p>
                                All evidence is compiled into a downloadable PDF report that can be shared
                                with insurers, legal teams, or fleet safety managers via a secure link.
                            </p>

                            <h4>Key features</h4>
                            <ul>
                                <li>Automatic report generation for detected collisions — no manual triggering needed</li>
                                <li>On-demand reports for any vehicle and time range</li>
                                <li>Configurable email notifications when incidents exceed a severity threshold</li>
                                <li>Secure PDF sharing via time-limited links</li>
                                <li>Works across all Geotab federations (my.geotab.com, alpha.geotab.com, gov.geotab.com)</li>
                            </ul>
                        </div>
                    </Card.Content>
                </Card>

                <Card size="M" title="Info">
                    <Card.Content>
                        <div className="about-info">
                            <div><strong>Version:</strong> 2.0.0</div>
                            <div><strong>Database:</strong> {session?.database || 'N/A'}</div>
                            <div><strong>User:</strong> {session?.userName || 'N/A'}</div>
                        </div>
                        <div className="about-links">
                            <a
                                href="https://github.com/beefo/fleetclaim"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="zen-link"
                            >
                                GitHub Repository
                            </a>
                            <a
                                href="https://github.com/beefo/fleetclaim/issues"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="zen-link"
                            >
                                Report an Issue
                            </a>
                        </div>
                    </Card.Content>
                </Card>
            </Cards>
        </div>
    );
};
