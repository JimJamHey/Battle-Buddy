# Code signing (optional)

Unsigned builds work for a small test group. Testers use SmartScreen **More info → Run anyway** (Windows) or right-click → **Open** (macOS).

To ship without install warnings, buy a certificate and add GitHub Actions secrets. GitHub stores base64-encoded cert text, not the file itself.

## Windows

1. Export your code-signing `.pfx` from Windows.
2. Encode it (replace the path with your file):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\path\to\cert.pfx'))
```

3. Repo → **Settings → Secrets → Actions**:

| Secret | Value |
|---|---|
| `CSC_LINK` | Base64 string from step 2 |
| `CSC_KEY_PASSWORD` | `.pfx` export password |

## macOS

| Secret | Value |
|---|---|
| `MAC_CSC_LINK` | `base64 -i DeveloperID.p12` output |
| `MAC_CSC_KEY_PASSWORD` | p12 password |
| `APPLE_ID` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | 10-character Team ID |

Re-run **Actions → Release** after secrets are set.
