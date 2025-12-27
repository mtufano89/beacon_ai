// shoreline-server.js - AI Mockup Generator with Network Solutions Email

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// API Keys
const ANTHROPIC_API_KEY = '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';
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// HUBSPOT API
const HUBSPOT_API_KEY = 'pat-na2-bb48b0cd-0d2f-4ccd-8b2d-219dfad23b2a';
const HUBSPOT_API_URL = 'https://api.hubapi.com/crm/v3/objects/contacts';

// EMAIL CONFIGURATION - Gmail for SMS Notifications
const EMAIL_CONFIG = {
    service: 'gmail',
    auth: {
        user: 'm.tufano89@gmail.com',
        pass: 'vmfr zvjv jmqr bzne'  // Need to generate this from Google
    }
};

// SMS NOTIFICATION (via Email-to-SMS)
const SMS_NOTIFICATION = {
    enabled: true,
    phoneEmail: '2036051211@vtext.com'  // Your Verizon number
};

const transporter = nodemailer.createTransport(EMAIL_CONFIG);

// Database Setup
const db = new sqlite3.Database('./shoreline-leads.db', (err) => {
    if (err) {
        console.error('Database error:', err);
    } else {
        console.log('📊 Connected to Shoreline leads database');
        
        db.run(`
            CREATE TABLE IF NOT EXISTS leads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                business_name TEXT,
                business_type TEXT,
                description TEXT,
                goals TEXT,
                vibe TEXT,
                status TEXT DEFAULT 'new',
                estimated_value TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_contact DATETIME,
                notes TEXT
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS mockups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lead_id INTEGER,
                mockup_data TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (lead_id) REFERENCES leads(id)
            )
        `);
    }
});

// AI WEBSITE MOCKUP GENERATOR
app.post('/api/generate-mockup', async (req, res) => {
    try {
        const { 
            fullName,
            businessName, 
            email, 
            businessType, 
            description, 
            goals, 
            vibe 
        } = req.body;

        // Validate
        if (!fullName || !businessName || !email || !businessType || !description) {
            return res.status(400).json({
                success: false,
                message: 'Please fill in all required fields'
            });
        }

        // Split name into first and last
        const nameParts = fullName.trim().split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

        console.log(`🎨 Generating mockup for: ${fullName} - ${businessName} (${email})`);

        // Save lead to database
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT OR REPLACE INTO leads 
                 (email, business_name, business_type, description, goals, vibe, last_contact, notes)
                 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
                [email, businessName, businessType, description, goals, vibe, `Contact: ${fullName}`],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        // Create AI prompt
        const prompt = `You are an expert web designer at Shoreline Dev Co, a professional web development agency.

A potential client has requested a website mockup:

BUSINESS INFO:
- Name: ${businessName}
- Type: ${businessType}
- Description: ${description}
- Primary Goal: ${goals || 'not specified'}
- Desired Style: ${vibe || 'not specified'}

Create a detailed website design concept. Respond ONLY with valid JSON:

{
    "businessName": "${businessName}",
    "designOverview": "2-3 sentence description of the overall design direction and how it serves their business goals",
    "pages": ["array", "of", "recommended", "pages"],
    "features": ["array", "of", "key", "website", "features", "5-7 items"],
    "colors": [
        {"name": "Primary", "hex": "#123456"},
        {"name": "Secondary", "hex": "#654321"},
        {"name": "Accent", "hex": "#abcdef"}
    ],
    "ctas": ["array", "of", "call-to-action", "ideas"],
    "estimatedCost": "$399 - $999",
    "turnaroundTime": "2-3 days to 1-2 weeks"
}

PRICING RULES (FOLLOW EXACTLY):

Use "$399 (Starter Package)" + "2-3 days" ONLY if the business needs exactly 3 pages: Home, About, Contact. Nothing more.
Example: "Small consulting firm, just need basic web presence"

Use "$699 (Business Package)" + "5-7 days" for MOST businesses - this is your DEFAULT.
Examples: 
- Restaurant with menu page
- Service business with services page
- Gym with classes page
- Retail store with products page
- Any business with 4-6 pages
- Any business that mentions gallery, portfolio, team, FAQ, services

Use "$999 (Premium Package)" + "1-2 weeks" ONLY if they explicitly say:
- "sell online" or "e-commerce" or "shopping cart"
- "booking system" or "reservations"
- "member login" or "user accounts"
Examples that need Premium:
- "Online store selling handmade jewelry"
- "Salon with online booking"
- "Gym with member portal"

CRITICAL: If you're unsure, choose Business Package ($699). Premium should be rare.

REQUIREMENTS:
- Be specific and professional
- Match recommendations to their business type
- Focus on business outcomes
- Make them excited about the potential

Return ONLY the JSON.`;

        // Call Claude AI
        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });

        // Parse response
        const responseText = message.content[0].text;
        const cleanedText = responseText
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();
        
        const mockup = JSON.parse(cleanedText);

        // Save mockup to database
        db.run(
            `INSERT INTO mockups (lead_id, mockup_data)
             SELECT id, ? FROM leads WHERE email = ?`,
            [JSON.stringify(mockup), email]
        );

        console.log(`✅ Mockup generated for ${email}`);

        // Send to HubSpot
        try {
            const hubspotData = {
                properties: {
                    email: email,
                    firstname: firstName,
                    lastname: lastName,
                    company: businessName,
                    lifecyclestage: 'lead',
                    hs_lead_status: 'NEW'
                }
            };

            // Try to create the contact
            let hubspotResponse = await fetch(HUBSPOT_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(hubspotData)
            });

            if (hubspotResponse.ok) {
                const hubspotResult = await hubspotResponse.json();
                console.log(`📊 Contact created in HubSpot: ${email} (ID: ${hubspotResult.id})`);
            } else if (hubspotResponse.status === 409) {
                // Contact already exists - update it instead
                console.log(`📊 Contact exists, updating: ${email}`);
                
                // Search for the contact by email
                const searchResponse = await fetch(
                    `https://api.hubapi.com/crm/v3/objects/contacts/search`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            filterGroups: [{
                                filters: [{
                                    propertyName: 'email',
                                    operator: 'EQ',
                                    value: email
                                }]
                            }]
                        })
                    }
                );

                if (!searchResponse.ok) {
                    console.error(`📊 Search failed: ${await searchResponse.text()}`);
                    return;
                }

                const searchResult = await searchResponse.json();
                console.log(`📊 Found ${searchResult.results?.length || 0} matching contacts`);
                
                if (searchResult.results && searchResult.results.length > 0) {
                    const contactId = searchResult.results[0].id;
                    console.log(`📊 Updating contact ID: ${contactId}`);
                    
                    // Update the existing contact
                    const updateResponse = await fetch(
                        `${HUBSPOT_API_URL}/${contactId}`,
                        {
                            method: 'PATCH',
                            headers: {
                                'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(hubspotData)
                        }
                    );

                    if (updateResponse.ok) {
                        console.log(`📊 ✅ Contact updated in HubSpot: ${email} (ID: ${contactId})`);
                    } else {
                        console.error(`📊 ❌ Failed to update contact: ${await updateResponse.text()}`);
                    }
                } else {
                    console.error(`📊 ❌ No contact found with email: ${email}`);
                }
            } else {
                const errorText = await hubspotResponse.text();
                console.error(`📊 HubSpot error:`, errorText);
            }
        } catch (hubspotError) {
            console.error('📊 HubSpot failed (but mockup still generated):', hubspotError.message);
        }

        // Send SMS notification
        if (SMS_NOTIFICATION.enabled) {
            try {
                await transporter.sendMail({
                    from: '"Shoreline Lead Alert" <support@shorelinedevco.com>',
                    to: SMS_NOTIFICATION.phoneEmail,
                    subject: '', // Keep subject empty for cleaner SMS
                    text: `🚨 NEW LEAD: ${fullName} - ${businessName} (${email}) - ${mockup.estimatedCost}`
                });
                console.log(`📱 SMS notification sent`);
            } catch (smsError) {
                console.error('📱 SMS failed:', smsError.message);
            }
        }

        // Send email with mockup (DISABLED - can enable later)
        /*
        try {
            const emailHTML = generateMockupEmail(businessName, mockup);
            
            await transporter.sendMail({
                from: '"Shoreline Dev Co" <support@shorelinedevco.com>',
                to: email,
                subject: `🎨 Your ${businessName} Website Mockup from Beacon AI`,
                html: emailHTML
            });
            
            console.log(`📧 Email sent to ${email}`);
        } catch (emailError) {
            console.error('📧 Email failed (but mockup still generated):', emailError.message);
            // Don't fail the whole request if email fails
        }
        */
        console.log(`📧 Email disabled - contact added to HubSpot instead`);

        res.json({
            success: true,
            mockup: mockup
        });

    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate mockup',
            error: error.message
        });
    }
});

// EMAIL TEMPLATE
function generateMockupEmail(businessName, mockup) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; }
            .header { background: linear-gradient(135deg, #1a2332, #4A90E2); padding: 40px 20px; text-align: center; color: white; }
            .content { padding: 30px 20px; }
            .mockup-section { background: #E8F4F8; padding: 20px; margin: 20px 0; border-left: 4px solid #4A90E2; border-radius: 5px; }
            .mockup-section h3 { color: #1a2332; margin-bottom: 10px; }
            .color-box { display: inline-block; width: 60px; height: 60px; margin: 5px; border-radius: 5px; border: 2px solid #ddd; }
            .cta-button { display: inline-block; background: #4A90E2; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; background: #f9f9f9; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎨 Your Website Mockup</h1>
                <p>Designed by Beacon AI for ${businessName}</p>
            </div>
            
            <div class="content">
                <h2>Hi there! 👋</h2>
                
                <p>Thanks for using our Beacon AI Website Mockup Generator! Here's the custom design concept we created for ${businessName}:</p>
                
                <div class="mockup-section">
                    <h3>Design Direction</h3>
                    <p>${mockup.designOverview}</p>
                </div>

                <div class="mockup-section">
                    <h3>Recommended Pages</h3>
                    <ul>
                        ${mockup.pages.map(page => `<li>${page}</li>`).join('')}
                    </ul>
                </div>

                <div class="mockup-section">
                    <h3>Key Features</h3>
                    <ul>
                        ${mockup.features.map(feature => `<li>${feature}</li>`).join('')}
                    </ul>
                </div>

                <div class="mockup-section">
                    <h3>Suggested Colors</h3>
                    ${mockup.colors.map(color => `
                        <div class="color-box" style="background: ${color.hex}" title="${color.name}"></div>
                    `).join('')}
                </div>

                <div style="background: #1a2332; padding: 30px; text-align: center; margin: 30px 0; border-radius: 10px; color: white;">
                    <h3 style="color: white;">Ready to Make This Real?</h3>
                    <p style="font-size: 1.25rem; margin: 15px 0;"><strong>${mockup.estimatedCost}</strong></p>
                    <p style="margin: 10px 0;">⏱️ Estimated Timeline: <strong>${mockup.turnaroundTime}</strong></p>
                    <a href="https://meetings-na2.hubspot.com/mike-tufano" class="cta-button">Schedule Your Free Consultation</a>
                    <p style="margin-top: 20px; font-size: 0.9rem; opacity: 0.9;">
                        Reply to this email with any questions - we read every response!
                    </p>
                </div>

                <p>Looking forward to working with you!</p>
                <p><strong>Shoreline Dev Co Team</strong></p>
            </div>

            <div class="footer">
                <p>Shoreline Dev Co | Professional Web Development</p>
                <p>www.shorelinedevco.com</p>
                <p>You received this because you requested a website mockup</p>
            </div>
        </div>
    </body>
    </html>
    `;
}

// ADMIN ENDPOINTS
app.get('/api/admin/leads', (req, res) => {
    db.all(
        `SELECT * FROM leads ORDER BY created_at DESC LIMIT 100`,
        [],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                success: true,
                count: rows.length,
                leads: rows
            });
        }
    );
});

app.get('/api/admin/analytics', (req, res) => {
    db.get(
        `SELECT 
            COUNT(*) as total_leads,
            COUNT(CASE WHEN status = 'new' THEN 1 END) as new_leads,
            COUNT(CASE WHEN status = 'contacted' THEN 1 END) as contacted,
            COUNT(CASE WHEN status = 'quoted' THEN 1 END) as quoted,
            COUNT(CASE WHEN status = 'won' THEN 1 END) as won,
            COUNT(CASE WHEN date(created_at) >= date('now', '-7 days') THEN 1 END) as week_leads
         FROM leads`,
        [],
        (err, stats) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            const winRate = stats.total_leads > 0 
                ? ((stats.won / stats.total_leads) * 100).toFixed(2)
                : 0;
            
            res.json({
                success: true,
                stats: {
                    ...stats,
                    winRate: `${winRate}%`,
                    estimatedValue: `$${(stats.won * 650).toLocaleString()}`
                }
            });
        }
    );
});

// START SERVER
app.listen(PORT, () => {
    console.log(`\n🌊 Shoreline Dev Co - Beacon AI System`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`🤖 AI Status: ${ANTHROPIC_API_KEY !== 'your-anthropic-api-key' ? 'ENABLED ✅' : 'DISABLED ⚠️'}`);
    console.log(`📧 Email: ${EMAIL_CONFIG.auth.pass !== 'YOUR-GMAIL-APP-PASSWORD-HERE' ? 'ENABLED ✅' : 'DISABLED ⚠️'}`);
    console.log(`📊 HubSpot: ${HUBSPOT_API_KEY ? 'ENABLED ✅' : 'DISABLED ⚠️'}`);
    console.log(`📱 SMS Alerts: ${SMS_NOTIFICATION.enabled ? 'ENABLED ✅' : 'DISABLED ⚠️'}\n`);
});

process.on('SIGINT', () => {
    db.close(() => {
        console.log('\n📊 Database closed');
        process.exit(0);
    });
});
