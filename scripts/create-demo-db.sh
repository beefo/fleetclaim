#!/bin/bash
# Create a MyGeotab demo database via API
# Usage: ./create-demo-db.sh <email> <password> <database_name>

EMAIL="${1:-beefizl@gmail.com}"
PASSWORD="${2}"
DB_NAME="${3:-demo_fleetclaim}"

if [ -z "$PASSWORD" ]; then
    echo "Usage: $0 <email> <password> [database_name]"
    echo "Example: $0 beefizl@gmail.com MySecurePass123 demo_fleetclaim"
    exit 1
fi

echo "Creating MyGeotab demo database: $DB_NAME"
echo "Admin email: $EMAIL"

# Create the database via API
RESPONSE=$(curl -s -X POST "https://my.geotab.com/apiv1" \
    -H "Content-Type: application/json" \
    -d "{
        \"method\": \"CreateDatabase\",
        \"params\": {
            \"database\": \"$DB_NAME\",
            \"userName\": \"$EMAIL\",
            \"password\": \"$PASSWORD\",
            \"companyDetails\": {
                \"companyName\": \"FleetClaim Demo\",
                \"firstName\": \"Steve\",
                \"lastName\": \"Hansen\",
                \"phoneNumber\": \"+1-555-0100\",
                \"resellerName\": \"Geotab\",
                \"signUpForNews\": false,
                \"comments\": \"FleetClaim integration testing\"
            }
        }
    }")

echo ""
echo "Response:"
echo "$RESPONSE" | jq .

# Check for success
if echo "$RESPONSE" | jq -e '.result' > /dev/null 2>&1; then
    SERVER=$(echo "$RESPONSE" | jq -r '.result')
    echo ""
    echo "✅ Database created successfully!"
    echo "Server: $SERVER"
    echo "Database: $DB_NAME"
    echo "Login URL: https://$SERVER"
else
    echo ""
    echo "❌ Failed to create database"
    ERROR=$(echo "$RESPONSE" | jq -r '.error.message // .error // "Unknown error"')
    echo "Error: $ERROR"
fi
