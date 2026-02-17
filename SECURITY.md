# Security Policy

## Supported Versions

| Version | Supported |
|---------|------------|
| Latest release | ✅ Supported |
| Previous versions | ❌ Not supported |

## Reporting a Vulnerability

We take the security of music-downloader seriously. If you believe you have found a security vulnerability, please report it responsibly.

### How to Report

1. **Do NOT** open a public GitHub issue
2. Email the vulnerability report to: **ndouralexandre09@gmail.com**
3. Include a detailed description of the vulnerability
4. Include steps to reproduce the issue
5. Include any relevant proof-of-concept code

### What to Expect

- We will acknowledge receipt of your report within 48 hours
- We will investigate and provide an initial assessment
- We will keep you informed of the progress
- We will credit you in our security advisory (if you wish)

## Security Best Practices

### Authentication Tokens

music-downloader uses OAuth tokens for Spotify and Developer Tokens for Apple Music. These tokens are stored locally in your system's configuration directory.

**Recommendations:**
- Never share your authentication tokens
- Regularly rotate your API credentials
- Use environment variables for sensitive data when possible

### API Security Notes

#### Spotify
- Uses OAuth 2.0 for authentication
- Requires user to authenticate via browser
- Tokens are stored locally and encrypted by the system keychain

#### Apple Music
- Uses Developer Tokens (JWT) for API access
- Requires valid Apple Developer account
- Tokens should be kept confidential

#### Deezer
- Uses session-based authentication
- May require captcha for repeated requests

### Data Privacy

music-downloader:
- Does NOT collect or transmit user data to third parties
- Stores only authentication tokens locally
- Downloads music files directly from source services
- Does NOT log personal information

### Network Security

- All API communications use HTTPS
- Certificate validation is enforced
- Proxy/tunnel support for restricted networks (Tor)

### Local File Security

- Downloaded files are stored locally on your system
- Temporary files are cleaned up after processing
- Metadata is embedded using industry-standard formats (ID3v2.4)

## Known Limitations

1. **Third-party Dependencies**: Uses yt-dlp for audio extraction - ensure you trust your yt-dlp source
2. **Authentication Expiry**: Tokens may expire and require re-authentication
3. **Rate Limiting**: Music services may impose rate limits on API requests

## Compliance

This tool is intended for personal use and educational purposes. Users are responsible for:
- Complying with local laws and regulations
- Respecting the terms of service of music platforms
- Not distributing copyrighted material without authorization

## Dependencies Security

| Dependency | Purpose | Security Notes |
|------------|---------|----------------|
| @ffmpeg/ffmpeg | Audio encoding | Official builds recommended |
| yt-dlp | YouTube extraction | Verify source integrity |
| AtomicParsley | Metadata tagging | Standalone binary |

## Version History

- **v1.0.0**: Initial release with interactive mode and improved security handling

## Contact

For security concerns, please contact: **aa.ndour5@isepat.edu.sn**
