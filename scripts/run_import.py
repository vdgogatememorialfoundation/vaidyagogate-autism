#!/usr/bin/env python3
"""
Import pre-registration data via API
"""
import urllib.request
import urllib.parse
import urllib.error
import http.cookiejar
import json
import sys
import os

BASE_URL = 'https://autism.vaidyagogate.org'
ADMIN_EMAIL = 'admin@vaidyagogate.org'
ADMIN_PASSWORD = 'Admin@2026'

def main():
    # Read TSV data
    tsv_file = os.path.join(os.path.dirname(__file__), 'prereg-data.tsv')
    if not os.path.exists(tsv_file):
        print(f"TSV file not found: {tsv_file}")
        sys.exit(1)
    
    with open(tsv_file, 'r') as f:
        tsv_data = f.read()
    
    lines = tsv_data.strip().split('\n')
    print(f"Loaded {len(lines)-1} records from TSV file")
    
    # Create cookie jar
    cookie_jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))
    
    # Login to admin
    print("Logging in to admin...")
    login_data = json.dumps({
        'email': ADMIN_EMAIL,
        'password': ADMIN_PASSWORD
    }).encode('utf-8')
    
    req = urllib.request.Request(
        f'{BASE_URL}/api/auth/login',
        data=login_data,
        headers={
            'Content-Type': 'application/json',
        }
    )
    
    try:
        response = opener.open(req, timeout=30)
        login_result = json.loads(response.read().decode())
        print(f"Login success!")
        print(f"User: {login_result.get('user', {}).get('email', 'N/A')}")
        
        # Get user ID for actingAdminId
        user_id = login_result.get('user', {}).get('id')
        print(f"User ID: {user_id}")
        
    except Exception as e:
        print(f"Login failed: {e}")
        sys.exit(1)
    
    # Check cookies
    cookies = [(c.name, c.value) for c in cookie_jar]
    print(f"Cookies: {cookies}")
    
    # Now call the import API with actingAdminId
    print("\nCalling import API...")
    
    import_data = json.dumps({
        'tsvData': tsv_data,
        'seminarId': 1,
        'actingAdminId': user_id
    }).encode('utf-8')
    
    req = urllib.request.Request(
        f'{BASE_URL}/api/admin/preregistrations/import-tsv',
        data=import_data,
        headers={
            'Content-Type': 'application/json',
        }
    )
    
    try:
        response = opener.open(req, timeout=120)
        result = json.loads(response.read().decode())
        print(f"\n{'='*50}")
        print("IMPORT RESULT:")
        print(f"{'='*50}")
        print(json.dumps(result, indent=2))
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.reason}")
        error_body = e.read().decode() if e.fp else ''
        print(f"Error body: {error_body[:500]}")
    except Exception as e:
        print(f"Import failed: {e}")

if __name__ == '__main__':
    main()
