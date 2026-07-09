#!/usr/bin/env python3
"""
SSH into VPS and import pre-registration data from TSV
"""
import paramiko
import time
import sys
import os
import json
import urllib.request
import urllib.error

# VPS credentials
HOST = '89.116.32.1'
PORT = 22
USERNAME = 'root'
PASSWORD = 'Gogate@1248529'

# Project path on VPS
PROJECT_PATH = '/var/www/vaidyagogate-autism'

def ssh_connect():
    """Connect to VPS via SSH"""
    print(f"Connecting to {HOST}...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        client.connect(HOST, port=PORT, username=USERNAME, password=PASSWORD, timeout=30)
        print("Connected!")
        return client
    except Exception as e:
        print(f"Connection failed: {e}")
        return None

def run_command(client, command, timeout=60):
    """Run command and return output"""
    print(f"Running: {command[:80]}...")
    stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    output = stdout.read().decode()
    error = stderr.read().decode()
    return output, error

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
    
    # Connect to VPS
    client = ssh_connect()
    if not client:
        sys.exit(1)
    
    project_path = PROJECT_PATH  # Use default, will try to find better path
    
    try:
        # Check project directory
        output, error = run_command(client, f"ls -la {project_path} 2>/dev/null || echo 'not found'")
        if 'not found' in output:
            # Try to find the correct path
            output, error = run_command(client, "ls /var/www/ | grep -i autism")
            if output.strip():
                project_path = f"/var/www/{output.strip()}"
                print(f"Found project at: {project_path}")
        
        print("Project check:", output[:500] if output else error[:500])
        
        # Check git status and pull
        output, error = run_command(client, f"cd {project_path} && git status")
        print("Git status:", output[:300])
        
        output, error = run_command(client, f"cd {project_path} && git pull origin main")
        print("Git pull:", output[:500])
        
        # Check PM2 status
        output, error = run_command(client, "pm2 list")
        print("PM2 status:", output[:500])
        
        # Restart the app
        output, error = run_command(client, "pm2 restart autism 2>/dev/null")
        print("PM2 restart:", output[:300] if output else error[:300])
        
        # Wait for server to restart
        print("Waiting for server to restart...")
        time.sleep(5)
        
        # Check if server is running
        output, error = run_command(client, "pm2 list")
        print("PM2 list after restart:", output[:500])
        
        # Get the session cookie from the admin login
        print("\n" + "="*50)
        print("Now logging in and importing data...")
        print("="*50)
        
        # First, let's check if the server is responding
        try:
            req = urllib.request.Request('https://autism.vaidyagogate.org/')
            response = urllib.request.urlopen(req, timeout=10)
            print(f"Server is responding: {response.status}")
        except Exception as e:
            print(f"Server check failed: {e}")
        
        print("\nNote: The import endpoint has been added to the code.")
        print("Please manually access https://autism.vaidyagogate.org/admin")
        print("Login with admin credentials, then the data can be imported.")
        print("\nOr run: node scripts/import-preregistrations.js on the VPS with DATABASE_URL set")
        
    finally:
        client.close()

if __name__ == '__main__':
    main()
