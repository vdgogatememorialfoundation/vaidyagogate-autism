/** Default notification templates (admin-editable; synced on deploy via syncDefaultNotificationTemplates). */
const portalProduct = require('./portal-product');
const PORTAL_TITLE = portalProduct.FEATURES.portalTitle || 'Autism Awareness Portal';
const FOUNDATION = portalProduct.FEATURES.foundationName || 'Vaidya Gogate Memorial Foundation';
/** @deprecated use {{portal_title}} or {{seminar_name}} in templates */
const SEMINAR = PORTAL_TITLE;
const TEAM = 'Team ' + FOUNDATION + '<br>' + PORTAL_TITLE + ' Support';

const EVENT_KEYS = [
    'ACCOUNT_CREATED',
    'FORGOT_PASSWORD',
    'OTP_VERIFICATION',
    'EMAIL_VERIFICATION',
    'SEMINAR_REGISTRATION_SUCCESS',
    'PREREGISTRATION_SUBMITTED',
    'PREREGISTRATION_APPROVED',
    'PREREGISTRATION_REJECTED',
    'PREREGISTRATION_REVISION_REQUIRED',
    'PAYMENT_SUCCESS',
    'PAYMENT_FAILED',
    'PAYMENT_PENDING',
    'APPLICATION_UNDER_REVIEW',
    'APPLICATION_APPROVED',
    'APPLICATION_REJECTED',
    'APPLICATION_REVISION_REQUIRED',
    'TICKET_ISSUED',
    'QR_TICKET_REISSUED',
    'CHECK_IN_SUCCESS',
    'CHECK_IN_FAILED',
    'SEMINAR_REMINDER',
    'EVENT_STARTING_TODAY',
    'CERTIFICATE_AVAILABLE',
    'CERTIFICATE_REISSUED',
    'CASE_PRESENTATION_SUBMITTED',
    'CASE_PRESENTATION_APPROVED',
    'CASE_PRESENTATION_REJECTED',
    'CASE_PRESENTATION_NEEDS_CHANGES',
    'ADMIN_ANNOUNCEMENT',
    'WHATSAPP_GROUP_INVITE',
    'INVOICE_GENERATED',
    'REFUND_INITIATED',
    'REFUND_COMPLETED',
    'REGISTRATION_CANCELLED',
    'SUPPORT_TICKET_CREATED',
    'SUPPORT_TICKET_REPLY_TO_DOCTOR',
    'SUPPORT_TICKET_REPLY_TO_ADMIN',
    'CASE_MESSAGE_FROM_JUDGE',
    'CASE_MESSAGE_FROM_PARTICIPANT',
    'THREAD_REPLY_NEW_RESPONSE',
    'CASE_PRIORITY_INVITED',
    'WAITLIST_CONFIRMED',
    'REGISTRATION_PENDING_REMINDER'
];

/** Email-safe CTA (use &lt;a&gt; styled as button — HTML &lt;button&gt; does not work in email). */
function emailCtaButton(href, label) {
    const url = href || '#';
    const text = label || 'Open portal';
    return (
        '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0;">' +
        '<tr><td align="left" style="border-radius:10px;background:#0f766e;">' +
        '<a href="' +
        url +
        '" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">' +
        text +
        '</a></td></tr></table>'
    );
}

function wrapHtml(title, body) {
    return (
        '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1f36;">' +
        '<div style="background:#f8fafc;padding:20px;border-radius:12px 12px 0 0;border:1px solid #e2e8f0;">' +
        '<strong style="color:#1e3a8a;">' +
        title +
        '</strong></div>' +
        '<div style="padding:20px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;line-height:1.6;">' +
        body +
        '<p style="margin-top:20px;font-size:12px;color:#64748b;">Regards,<br>' +
        TEAM +
        '</p></div></div>'
    );
}

const DEFAULT_TEMPLATES = [
    {
        event_key: 'OTP_VERIFICATION',
        channel: 'both',
        email_subject: 'Verify your email — {{portal_title}}',
        email_html: wrapHtml(
            'Email verification',
            '<p>Dear Participant,</p><p>Thank you for registering on the {{portal_title}}.</p><p>To verify your email address, please use the OTP below:</p>' +
                '<p style="font-size:22px;font-weight:bold;letter-spacing:4px;">Your 4-Digit OTP: {{otp_code}}</p>' +
                '<p>This OTP is valid for 10 minutes only. Please do not share it with anyone for security reasons.</p>' +
                '<p>If you did not request this verification, please ignore this email.</p>'
        ),
        whatsapp_body:
            '🔐 OTP Verification\nHello,\nYour OTP for {{portal_title}} verification is:\n{{otp_code}}\nThis OTP is valid for 10 minutes.\nDo not share it with anyone.'
    },
    {
        event_key: 'EMAIL_VERIFICATION',
        channel: 'email',
        email_subject: 'Confirm your email — {{portal_title}}',
        email_html: wrapHtml(
            'Confirm your email',
            '<p>Dear {{full_name}},</p><p>Please confirm that <strong>{{email}}</strong> belongs to you so you can sign in to the portal.</p>' +
                emailCtaButton('{{verify_link}}', 'Verify email address') +
                '<p style="font-size:12px;color:#64748b;">If the button does not work, copy this link into your browser:<br>{{verify_link}}</p>' +
                '<p>This link expires in 48 hours. If you did not create an account, you can ignore this message.</p>'
        ),
        whatsapp_body: 'Hello {{first_name}}, confirm your email for {{portal_title}}: {{verify_link}}'
    },
    {
        event_key: 'ACCOUNT_CREATED',
        channel: 'both',
        email_subject: 'Your login details — {{portal_title}}',
        email_html: wrapHtml(
            'Account created',
            '<p>Dear {{full_name}},</p><p>Your account on the {{portal_title}} has been created. Use the details below to sign in.</p>' +
                '<p><strong>Your login details</strong></p><ul style="line-height:1.7;">' +
                '<li><strong>Portal ID:</strong> {{user_id_string}}</li>' +
                '<li><strong>Email:</strong> {{email}}</li>' +
                '<li><strong>Password:</strong> {{temporary_password}}</li>' +
                '<li><strong>Sign-in page:</strong> {{portal_login_url}}</li></ul>' +
                '<p>Please change your password after your first sign-in.</p>' +
                emailCtaButton('{{portal_login_url}}', 'Sign in now')
        ),
        whatsapp_body:
            'Account created — {{portal_title}}\nHello {{first_name}},\nPortal ID: {{user_id_string}}\nEmail: {{email}}\nPassword: {{temporary_password}}\nSign in: {{portal_login_url}}\nChange your password after first login.'
    },
    {
        event_key: 'SEMINAR_REGISTRATION_SUCCESS',
        channel: 'both',
        email_subject: 'Registration submitted — {{seminar_name}}',
        email_html: wrapHtml(
            'Application submitted',
            '<p>Dear {{full_name}},</p><p>Your application for <strong>{{seminar_name}}</strong> has been successfully submitted.</p><p><strong>Application Details:</strong><br>Application ID: {{application_no}}<br>Status: Submitted</p>' +
                '<p>Our team will review your application shortly.</p>'
        ),
        whatsapp_body:
            '✅ Application Submitted\nHello {{first_name}},\nYour registration for {{seminar_name}} has been submitted successfully.\n📄 Application ID: {{application_no}}\n📌 Status: Submitted'
    },
    {
        event_key: 'PREREGISTRATION_SUBMITTED',
        channel: 'both',
        email_subject: 'Pre-registration submitted — {{seminar_name}}',
        email_html: wrapHtml(
            'Pre-registration submitted',
            '<p>Dear {{full_name}},</p><p>Your pre-registration for <strong>{{seminar_name}}</strong> has been received.</p>' +
                '<p><strong>Details:</strong><br>Pre-registration ID: {{application_no}}<br>Status: Pending review</p>' +
                '<p>Our team will review your pre-registration and notify you when there is an update.</p>' +
                emailCtaButton('{{portal_login_url}}', 'Track pre-registration')
        ),
        whatsapp_body:
            '✅ Pre-registration submitted\nHello {{first_name}},\nYour pre-registration for {{seminar_name}} was received.\n📄 ID: {{application_no}}\n📌 Status: Pending review'
    },
    {
        event_key: 'PREREGISTRATION_APPROVED',
        channel: 'both',
        email_subject: 'Pre-registration approved — {{seminar_name}}',
        email_html: wrapHtml(
            'Pre-registration approved',
            '<p>Dear {{full_name}},</p><p>Your pre-registration for <strong>{{seminar_name}}</strong> has been approved.</p>' +
                '<p>Pre-registration ID: {{application_no}}<br>Status: Approved</p>' +
                '<p>If final registration is already open, sign in to complete it. Otherwise we will notify you when final registration opens.</p>' +
                emailCtaButton('{{portal_login_url}}', 'Open portal')
        ),
        whatsapp_body:
            '🎉 Pre-registration approved\nHello {{first_name}},\nYour pre-registration for {{seminar_name}} is approved.\n📄 ID: {{application_no}}\nSign in when final registration opens.'
    },
    {
        event_key: 'PREREGISTRATION_REJECTED',
        channel: 'both',
        email_subject: 'Pre-registration update — {{seminar_name}}',
        email_html: wrapHtml(
            'Pre-registration not approved',
            '<p>Dear {{full_name}},</p><p>Thank you for your interest in <strong>{{seminar_name}}</strong>.</p>' +
                '<p>After review, your pre-registration (ID: {{application_no}}) was not approved.</p>' +
                '{{rejection_reason_block}}' +
                '<p>For clarification, please contact support.</p>'
        ),
        whatsapp_body:
            'Hello {{first_name}},\nYour pre-registration for {{seminar_name}} was reviewed.\n📄 ID: {{application_no}}\n📌 Status: Not approved\nContact support if you need help.'
    },
    {
        event_key: 'PREREGISTRATION_REVISION_REQUIRED',
        channel: 'both',
        email_subject: 'Pre-registration — changes needed ({{application_no}})',
        email_html: wrapHtml(
            'Pre-registration needs changes',
            '<p>Dear {{full_name}},</p><p>Your pre-registration <strong>{{application_no}}</strong> for {{seminar_name}} was reviewed.</p>' +
                '<p>Please update your pre-registration and submit again using the same ID.</p>' +
                '{{rejection_reason_block}}' +
                emailCtaButton('{{portal_login_url}}', 'Update pre-registration')
        ),
        whatsapp_body:
            'Hello {{first_name}},\nPre-registration {{application_no}} for {{seminar_name}} needs changes.\n{{rejection_reason}}\nUpdate and resubmit in the portal.'
    },
    {
        event_key: 'CASE_PRESENTATION_SUBMITTED',
        channel: 'both',
        email_subject: 'Case presentation submitted — {{seminar_name}}',
        email_html: wrapHtml(
            'Case presentation submitted',
            '<p>Dear {{full_name}},</p><p>Your case presentation application for <strong>{{seminar_name}}</strong> has been successfully submitted.</p><p><strong>Submission Details:</strong><br>Application ID: {{application_no}}<br>Status: Under Review</p>' +
                '<p>You will receive updates once your submission is reviewed.</p>'
        ),
        whatsapp_body:
            '📚 Case Presentation Submitted\nHello {{first_name}},\nYour case presentation for {{seminar_name}} has been submitted successfully.\n📄 Application ID: {{application_no}}\n📌 Status: Under Review'
    },
    {
        event_key: 'PAYMENT_SUCCESS',
        channel: 'both',
        email_subject: 'Payment successful — {{seminar_name}}',
        email_html: wrapHtml(
            'Payment successful',
            '<p>Dear {{full_name}},</p><p>We have successfully received your payment for <strong>{{seminar_name}}</strong>.</p><p><strong>Payment Details:</strong><br>Payment ID: {{payment_id}}<br>Amount Paid: ₹{{payment_amount}}<br>Status: Paid</p>' +
                '<p>Your registration is now confirmed.</p>'
        ),
        whatsapp_body:
            '💳 Payment Successful\nHello {{first_name}},\nYour payment for {{seminar_name}} has been received successfully.\n💰 Amount: ₹{{payment_amount}}\n🧾 Payment ID: {{payment_id}}\n📌 Status: Paid{{whatsapp_group_line}}'
    },
    {
        event_key: 'TICKET_ISSUED',
        channel: 'both',
        email_subject: 'Your e-ticket is ready — {{seminar_name}}',
        email_html: wrapHtml(
            'E-ticket ready',
            '<p>Dear {{full_name}},</p><p>Your e-ticket for <strong>{{seminar_name}}</strong> has been generated successfully.</p><p><strong>Ticket Details:</strong><br>Ticket ID: {{ticket_id}}<br>Participant ID: {{user_id_string}}</p>' +
                '<p>Please carry your e-ticket during event entry.</p>' +
                emailCtaButton('{{ticket_pdf_url}}', 'Open printable ticket (PDF)') +
                emailCtaButton('{{qr_code_url}}', 'View in portal')
        ),
        whatsapp_body:
            '🎟️ E-Ticket Generated\nHello {{first_name}},\nYour e-ticket for {{seminar_name}} is ready.\n🎫 Ticket ID: {{ticket_id}}\n🆔 Participant ID: {{user_id_string}}\nPrintable ticket: {{ticket_pdf_url}}\nPlease carry it for entry.'
    },
    {
        event_key: 'APPLICATION_APPROVED',
        channel: 'both',
        email_subject: 'Application approved — {{seminar_name}}',
        email_html: wrapHtml(
            'Application approved',
            '<p>Dear {{full_name}},</p><p>Congratulations! Your application for <strong>{{seminar_name}}</strong> has been approved.</p><p>Application ID: {{application_no}}<br>Status: Approved</p><p>We look forward to welcoming you.</p>'
        ),
        whatsapp_body:
            '🎉 Application Approved!\nHello {{first_name}},\nYour application for {{seminar_name}} has been approved successfully.\n📄 Application ID: {{application_no}}\n📌 Status: Approved'
    },
    {
        event_key: 'APPLICATION_REJECTED',
        channel: 'both',
        email_subject: 'Application status update — {{seminar_name}}',
        email_html: wrapHtml(
            'Application not approved',
            '<p>Dear {{full_name}},</p><p>Thank you for your interest in <strong>{{seminar_name}}</strong>.</p><p>After review, we regret to inform you that your application has not been approved.</p>' +
                '<p>Application ID: {{application_no}}<br>Status: Rejected</p><p>For any clarification, please contact support.</p>'
        ),
        whatsapp_body:
            'Hello {{first_name}},\nYour application for {{seminar_name}} was reviewed.\n📄 Application ID: {{application_no}}\n📌 Status: Rejected\nFor assistance, contact support.'
    },
    {
        event_key: 'APPLICATION_REVISION_REQUIRED',
        channel: 'both',
        email_subject: 'Action required — re-upload documents (same application no.)',
        email_html: wrapHtml(
            'Documents need correction',
            '<p>Dear {{full_name}},</p><p>Your application <strong>{{application_no}}</strong> for {{seminar_name}} was reviewed.</p>' +
                '<p>Your details look acceptable, but the <strong>certificate document and/or NCISM registration number</strong> need correction.</p>' +
                '<p><strong>Admin note:</strong> {{rejection_reason}}</p>' +
                '<p>Sign in to the portal, open <strong>Track applications</strong>, and re-upload on the <em>same application number</em>. No new application is needed.</p>' +
                emailCtaButton('{{portal_login_url}}', 'Open portal')
        ),
        whatsapp_body:
            'Hello {{first_name}},\nYour application {{application_no}} for {{seminar_name}} needs corrected documents.\nReason: {{rejection_reason}}\nRe-upload in the portal using the SAME application number.'
    },
    {
        event_key: 'PAYMENT_PENDING',
        channel: 'both',
        email_subject: 'Complete your payment — {{seminar_name}}',
        email_html: wrapHtml(
            'Payment pending',
            '<p>Dear {{full_name}},</p><p>Your application for <strong>{{seminar_name}}</strong> has been received, but payment is still pending.</p>' +
                '<p>Please complete your payment to confirm your registration.</p><p>Application ID: {{application_no}}<br>Status: Payment Pending</p>' +
                emailCtaButton('{{portal_login_url}}', 'Complete payment in portal')
        ),
        whatsapp_body:
            '⏳ Payment Pending\nHello {{first_name}},\nYour registration for {{seminar_name}} is incomplete as payment is pending.\n📄 Application ID: {{application_no}}\nComplete payment to confirm your seat.'
    },
    {
        event_key: 'APPLICATION_UNDER_REVIEW',
        channel: 'both',
        email_subject: 'Application received — {{seminar_name}}',
        email_html: wrapHtml(
            'Under review',
            '<p>Dear {{full_name}},</p><p>We received your application <strong>{{application_no}}</strong> for {{seminar_name}}.</p>' +
                '<p>Our team is reviewing your documents. You will be notified when there is an update.</p>' +
                emailCtaButton('{{portal_login_url}}', 'Open portal')
        ),
        whatsapp_body:
            'Hello {{first_name}}, your application {{application_no}} for {{seminar_name}} is under review. Check the portal for updates.'
    },
    {
        event_key: 'REGISTRATION_PENDING_REMINDER',
        channel: 'both',
        email_subject: 'Reminder — complete your registration ({{application_no}})',
        email_html: wrapHtml(
            'Registration pending',
            '<p>Dear {{full_name}},</p><p>Your application <strong>{{application_no}}</strong> for {{seminar_name}} is still pending.</p>' +
                '<p>Please sign in and upload any missing documents (NCISM registration and certificate) or corrections requested by the office.</p>' +
                emailCtaButton('{{portal_login_url}}', 'Complete registration')
        ),
        whatsapp_body:
            'Reminder: {{first_name}}, application {{application_no}} for {{seminar_name}} needs your attention. Please complete documents in the portal.'
    },
    {
        event_key: 'SEMINAR_REMINDER',
        channel: 'both',
        email_subject: 'Reminder — {{seminar_name}} starts soon',
        email_html: wrapHtml(
            'Event reminder',
            '<p>Dear {{full_name}},</p><p>This is a reminder that <strong>{{seminar_name}}</strong> is approaching.</p><p>Event Date: {{seminar_date}}<br>Venue: {{seminar_venue}}<br>Participant ID: {{user_id_string}}</p>' +
                '<p>Please carry your e-ticket for entry.</p>'
        ),
        whatsapp_body:
            'Reminder: {{seminar_name}} on {{seminar_date}} at {{seminar_venue}}. Participant ID: {{user_id_string}}'
    },
    {
        event_key: 'CHECK_IN_SUCCESS',
        channel: 'both',
        email_subject: 'Check-in confirmed — {{seminar_name}}',
        email_html: wrapHtml(
            'Check-in confirmed',
            '<p>Dear {{full_name}},</p><p>Your check-in for <strong>{{seminar_name}}</strong> has been successfully completed.</p><p><strong>Details:</strong><br>Participant ID: {{user_id_string}}<br>Check-In Time: {{check_in_time}}<br>Status: Checked-In</p>' +
                '<p>Thank you for joining us. We hope you have a valuable learning experience.</p>'
        ),
        whatsapp_body:
            '✅ Check-In Confirmed!\nHello {{first_name}},\nYour check-in for {{seminar_name}} has been successfully completed.\n🆔 Participant ID: {{user_id_string}}\n🕒 Time: {{check_in_time}}\n📌 Status: Checked-In\nThank you for attending!'
    },
    {
        event_key: 'CERTIFICATE_AVAILABLE',
        channel: 'both',
        email_subject: 'Your e-certificate is ready — {{seminar_name}}',
        email_html: wrapHtml(
            'Certificate ready',
            '<p>Dear {{full_name}},</p><p>Congratulations! Your e-certificate for participating in <strong>{{seminar_name}}</strong> has been generated successfully.</p><p><strong>Certificate Details:</strong><br>Certificate ID: {{certificate_id}}<br>Participant ID: {{user_id_string}}</p>' +
                '<p>You can now log in to the portal and download your certificate.</p>' +
                emailCtaButton('{{certificate_url}}', 'Download certificate')
        ),
        whatsapp_body:
            '🎓 E-Certificate Generated!\nHello {{first_name}},\nYour participation certificate for {{seminar_name}} is ready.\n📄 Certificate ID: {{certificate_id}}\n🆔 Participant ID: {{user_id_string}}\nPlease log in to the portal to download your certificate.\nCongratulations! 🎉'
    },
    {
        event_key: 'FORGOT_PASSWORD',
        channel: 'both',
        email_subject: 'Password reset — {{portal_title}}',
        email_html: wrapHtml(
            'Password reset',
            '<p>Dear {{full_name}},</p><p>Reset your password using the button below (link valid for 1 hour):</p>' +
                emailCtaButton('{{forgot_password_link}}', 'Reset password') +
                '<p style="font-size:12px;color:#64748b;">Or copy this link: {{forgot_password_link}}</p>' +
                '<p>If you did not request this, ignore this message.</p>'
        ),
        whatsapp_body: 'Hello {{first_name}}, reset your password: {{forgot_password_link}}'
    },
    {
        event_key: 'SUPPORT_TICKET_CREATED',
        channel: 'both',
        email_subject: 'Support ticket received — {{portal_title}}',
        email_html: wrapHtml(
            'Support ticket received',
            '<p>Dear {{full_name}},</p><p>We received your support ticket <strong>{{ticket_id}}</strong> regarding <strong>{{ticket_subject}}</strong>.</p>' +
                '<p>Expected response by: <strong>{{expected_response_display}}</strong> (IST), when configured.</p>' +
                '<p>Our team will reply in your dashboard. <strong>Do not reply to this email.</strong></p>' +
                emailCtaButton('{{portal_login_url}}', 'Reply in dashboard')
        ),
        whatsapp_body:
            'Hello {{first_name}}, we received your support ticket {{ticket_id}} ({{ticket_subject}}). Reply in your dashboard: {{portal_login_url}} (do not reply to this email).'
    },
    {
        event_key: 'SUPPORT_TICKET_REPLY_TO_DOCTOR',
        channel: 'both',
        email_subject: 'New reply on your support ticket — {{portal_title}}',
        email_html: wrapHtml(
            'Support ticket reply',
            '<p>Dear {{full_name}},</p><p>Admin replied on ticket <strong>{{ticket_id}}</strong> ({{ticket_subject}}):</p><blockquote style="border-left:4px solid #0d9488;padding:8px 14px;background:#f0fdfa;">{{ticket_message}}</blockquote>' +
                '<p><strong>Reply in your dashboard — do not reply to this email.</strong></p>' +
                emailCtaButton('{{portal_login_url}}', 'Reply in dashboard')
        ),
        whatsapp_body:
            'Reply on ticket {{ticket_id}}: {{ticket_message}} — Reply in dashboard: {{portal_login_url}}'
    },
    {
        event_key: 'SUPPORT_TICKET_REPLY_TO_ADMIN',
        channel: 'email',
        enabled: 1,
        email_subject: 'Doctor replied on support ticket',
        email_html: wrapHtml(
            'Doctor support reply',
            '<p>A user replied on ticket <strong>{{ticket_id}}</strong> ({{ticket_subject}}).</p><blockquote style="border-left:4px solid #f97316;padding:8px 14px;background:#fff7ed;">{{ticket_message}}</blockquote><p><strong>Open the admin dashboard to reply — do not reply to this email.</strong></p>'
        ),
        whatsapp_body: ''
    },
    {
        event_key: 'SUPPORT_TICKET_STATUS_CHANGED',
        channel: 'both',
        email_subject: 'Support ticket status updated — {{portal_title}}',
        email_html: wrapHtml(
            'Ticket status updated',
            '<p>Dear {{full_name}},</p><p>Your support ticket <strong>{{ticket_id}}</strong> ({{ticket_subject}}) status is now <strong>{{ticket_status}}</strong>.</p><p>{{ticket_message}}</p>' +
                '<p><strong>Reply in your dashboard — do not reply to this email.</strong></p>' +
                emailCtaButton('{{portal_login_url}}', 'Open dashboard')
        ),
        whatsapp_body:
            'Ticket {{ticket_id}} status: {{ticket_status}}. {{ticket_message}} — {{portal_login_url}}'
    },
    {
        event_key: 'SUPPORT_TICKET_PRIORITY_CHANGED',
        channel: 'both',
        email_subject: 'Support ticket priority updated — {{portal_title}}',
        email_html: wrapHtml(
            'Ticket priority updated',
            '<p>Dear {{full_name}},</p><p>Ticket <strong>{{ticket_id}}</strong> priority is now <strong>{{ticket_priority}}</strong>.</p><p>{{ticket_message}}</p>' +
                '<p><strong>Reply in your dashboard — do not reply to this email.</strong></p>' +
                emailCtaButton('{{portal_login_url}}', 'Open dashboard')
        ),
        whatsapp_body: 'Ticket {{ticket_id}} priority: {{ticket_priority}}. {{portal_login_url}}'
    },
    {
        event_key: 'SUPPORT_TICKET_TRANSFERRED',
        channel: 'both',
        email_subject: 'Support ticket assigned to you — {{portal_title}}',
        email_html: wrapHtml(
            'Support ticket transferred',
            '<p>Dear {{full_name}},</p><p>Support ticket <strong>{{ticket_id}}</strong> ({{ticket_subject}}) has been assigned to your account.</p><p>{{ticket_message}}</p>' +
                '<p><strong>Reply in your dashboard — do not reply to this email.</strong></p>' +
                emailCtaButton('{{portal_login_url}}', 'Reply in dashboard')
        ),
        whatsapp_body: 'Ticket {{ticket_id}} transferred to you. {{portal_login_url}}'
    },
    {
        event_key: 'SUPPORT_TICKET_TRANSFERRED_AWAY',
        channel: 'both',
        email_subject: 'Support ticket moved — {{portal_title}}',
        email_html: wrapHtml(
            'Support ticket moved',
            '<p>Dear {{full_name}},</p><p>Ticket <strong>{{ticket_id}}</strong> ({{ticket_subject}}) was moved to another account.</p><p>{{ticket_message}}</p>'
        ),
        whatsapp_body: 'Ticket {{ticket_id}} was moved to another account.'
    },
    {
        event_key: 'CASE_JUDGE_TRANSFER_ASSIGNED',
        channel: 'both',
        email_subject: 'Case assigned to you for judging — {{seminar_name}}',
        email_html: wrapHtml(
            'Case assignment',
            '<p>Dear {{judge_name}},</p><p>Case application <strong>{{application_no}}</strong> ({{case_topic}}) has been assigned to you for judging by {{transferred_by}}.</p>' +
                emailCtaButton('{{portal_login_url}}', 'Open judge portal')
        ),
        whatsapp_body: 'Case {{application_no}} assigned to you. Judge portal: {{portal_login_url}}'
    },
    {
        event_key: 'CASE_MESSAGE_FROM_JUDGE',
        channel: 'both',
        email_subject: 'Message from judge on your case — {{seminar_name}}',
        email_html: wrapHtml(
            'Judge message',
            '<p>Dear {{full_name}},</p><p><strong>{{judge_name}}</strong> sent a message about case <strong>{{application_no}}</strong> ({{case_topic}}):</p>' +
                '<blockquote style="border-left:4px solid #7c3aed;padding:8px 14px;background:#f5f3ff;">{{case_message}}</blockquote>' +
                emailCtaButton('{{portal_login_url}}', 'Reply in portal')
        ),
        whatsapp_body:
            'Judge {{judge_name}} — case {{application_no}}: {{case_message}} — Reply: {{portal_login_url}}'
    },
    {
        event_key: 'CASE_MESSAGE_FROM_PARTICIPANT',
        channel: 'both',
        email_subject: 'Participant replied on case {{application_no}} — {{seminar_name}}',
        email_html: wrapHtml(
            'Participant reply',
            '<p>Dear {{judge_name}},</p><p><strong>{{participant_name}}</strong> replied on case <strong>{{application_no}}</strong>:</p>' +
                '<blockquote style="border-left:4px solid #059669;padding:8px 14px;background:#ecfdf5;">{{case_message}}</blockquote>' +
                emailCtaButton('{{portal_login_url}}', 'Open judge portal')
        ),
        whatsapp_body: '{{participant_name}} replied on {{application_no}}: {{case_message}} — {{portal_login_url}}'
    },
    {
        event_key: 'THREAD_REPLY_NEW_RESPONSE',
        channel: 'both',
        email_subject: 'You have a new response — {{portal_title}}',
        email_html: wrapHtml(
            'New response',
            '<p>Dear {{full_name}},</p><p>Someone replied on <strong>{{thread_label}}</strong>:</p>' +
                '<blockquote style="border-left:4px solid #0d9488;padding:8px 14px;background:#f0fdfa;">{{message_preview}}</blockquote>' +
                '<p>Open your {{portal_name}} dashboard to read and reply:</p>' +
                emailCtaButton('{{dashboard_url}}', 'Open dashboard')
        ),
        whatsapp_body: 'New reply on {{thread_label}}. Open: {{dashboard_url}}'
    },
    {
        event_key: 'CASE_PRIORITY_INVITED',
        channel: 'both',
        email_subject: 'Complete your case application (priority) — {{seminar_name}}',
        email_html: wrapHtml(
            'Priority case selection',
            '<p>Dear {{full_name}},</p><p>You have been selected for <strong>{{program_title}}</strong>. Application <strong>{{application_no}}</strong> was started from your profile — sign in to complete any missing details and upload your presentation files. Your application will receive <strong>priority review</strong>.</p>' +
                emailCtaButton('{{portal_login_url}}', 'Complete application')
        ),
        whatsapp_body:
            'Priority case invite {{application_no}} for {{program_title}}. Complete in portal: {{portal_login_url}}'
    },
    {
        event_key: 'CASE_JUDGE_TRANSFER_REMOVED',
        channel: 'both',
        email_subject: 'Case assignment transferred — {{seminar_name}}',
        email_html: wrapHtml(
            'Case reassigned',
            '<p>Dear {{judge_name}},</p><p>Case <strong>{{application_no}}</strong> has been reassigned from you to {{to_judge_name}} by {{transferred_by}}.</p>'
        ),
        whatsapp_body: 'Case {{application_no}} reassigned to {{to_judge_name}}.'
    },
    {
        event_key: 'WHATSAPP_GROUP_INVITE',
        channel: 'both',
        email_subject: 'Join the {{seminar_name}} WhatsApp group',
        email_html: wrapHtml(
            'WhatsApp group',
            '<p>Dear {{full_name}},</p><p>Payment is confirmed. Join the official WhatsApp group for <strong>{{seminar_name}}</strong> updates:</p>' +
                '<p><a href="{{whatsapp_group_link}}">{{whatsapp_group_link}}</a></p>'
        ),
        whatsapp_body: 'Hello {{first_name}}, join the WhatsApp group for {{seminar_name}}: {{whatsapp_group_link}}'
    },
    {
        event_key: 'PAYMENT_FAILED',
        channel: 'both',
        email_subject: 'Payment failed — {{seminar_name}}',
        email_html: wrapHtml(
            'Payment failed',
            '<p>Dear {{full_name}},</p><p>Your payment for <strong>{{seminar_name}}</strong> could not be completed. Please try again from <a href="{{portal_login_url}}">the portal</a>.</p>'
        ),
        whatsapp_body: 'Payment failed for {{seminar_name}}. Please retry via {{portal_login_url}}'
    },
    {
        event_key: 'CHECK_IN_FAILED',
        channel: 'both',
        enabled: 1,
        email_subject: 'Check-in could not be completed — {{seminar_name}}',
        email_html: wrapHtml(
            'Check-in issue',
            '<p>Dear {{full_name}},</p><p>We could not complete check-in for your registration at <strong>{{seminar_name}}</strong>.</p>' +
                '<p><strong>Reason:</strong> {{check_in_failure_reason}}</p>' +
                '<p>Please contact support or visit the help desk if you need assistance.</p>' +
                emailCtaButton('{{portal_login_url}}', 'Open portal')
        ),
        whatsapp_body: 'Hello {{first_name}}, check-in for {{seminar_name}} could not be completed: {{check_in_failure_reason}}'
    },
    {
        event_key: 'REFUND_COMPLETED',
        channel: 'both',
        enabled: 1,
        email_subject: 'Refund processed — {{seminar_name}}',
        email_html: wrapHtml(
            'Refund completed',
            '<p>Dear {{full_name}},</p><p>Your refund of <strong>₹{{refund_amount}}</strong> for <strong>{{seminar_name}}</strong> has been processed.</p>' +
                '<p>It may take a few business days to appear in your account depending on your bank.</p>'
        ),
        whatsapp_body: 'Hello {{first_name}}, your refund of ₹{{refund_amount}} for {{seminar_name}} has been processed.'
    },
    {
        event_key: 'QR_TICKET_REISSUED',
        channel: 'both',
        enabled: 1,
        email_subject: 'Your e-ticket was re-sent — {{seminar_name}}',
        email_html: wrapHtml(
            'E-ticket re-sent',
            '<p>Dear {{full_name}},</p><p>Your e-ticket for <strong>{{seminar_name}}</strong> has been re-sent.</p>' +
                '<p><strong>Ticket ID:</strong> {{ticket_id}}<br><strong>Participant ID:</strong> {{user_id_string}}</p>' +
                emailCtaButton('{{ticket_pdf_url}}', 'Open printable ticket (PDF)') +
                emailCtaButton('{{portal_login_url}}', 'View in portal')
        ),
        whatsapp_body: 'Hello {{first_name}}, your e-ticket for {{seminar_name}} ({{ticket_id}}) was re-sent. Portal: {{portal_login_url}}'
    },
    {
        event_key: 'CERTIFICATE_REISSUED',
        channel: 'both',
        enabled: 1,
        email_subject: 'Your certificate was re-sent — {{seminar_name}}',
        email_html: wrapHtml(
            'Certificate re-sent',
            '<p>Dear {{full_name}},</p><p>Your participation certificate for <strong>{{seminar_name}}</strong> has been re-sent.</p>' +
                emailCtaButton('{{certificate_url}}', 'Download certificate')
        ),
        whatsapp_body: 'Hello {{first_name}}, your certificate for {{seminar_name}} is ready again: {{certificate_url}}'
    },
    {
        event_key: 'EVENT_STARTING_TODAY',
        channel: 'both',
        enabled: 1,
        email_subject: 'Today is event day — {{seminar_name}}',
        email_html: wrapHtml(
            'Event today',
            '<p>Dear {{full_name}},</p><p><strong>{{seminar_name}}</strong> is scheduled for today.</p>' +
                '<p>Date: {{seminar_date}}<br>Venue: {{seminar_venue}}<br>Participant ID: {{user_id_string}}</p>' +
                emailCtaButton('{{portal_login_url}}', 'Open portal')
        ),
        whatsapp_body: 'Hello {{first_name}}, {{seminar_name}} is today ({{seminar_date}}). Participant ID: {{user_id_string}}'
    },
    {
        event_key: 'ADMIN_ANNOUNCEMENT',
        channel: 'both',
        enabled: 1,
        email_subject: 'Important update — {{seminar_name}}',
        email_html: wrapHtml(
            'Announcement',
            '<p>Dear {{full_name}},</p><p><strong>{{ticket_subject}}</strong></p><p>{{announcement_body}}</p>' +
                '<p>Event: <strong>{{seminar_name}}</strong></p>' +
                emailCtaButton('{{portal_login_url}}', 'Open portal')
        ),
        whatsapp_body: 'Hello {{first_name}}, update for {{seminar_name}}: {{ticket_subject}} — {{announcement_body}}'
    },
    {
        event_key: 'INVOICE_GENERATED',
        channel: 'both',
        enabled: 1,
        email_subject: 'Payment receipt — {{seminar_name}}',
        email_html: wrapHtml(
            'Payment receipt',
            '<p>Dear {{full_name}},</p><p>Your payment receipt for <strong>{{seminar_name}}</strong> is available.</p>' +
                '<p>Amount: ₹{{payment_amount}}<br>Payment ID: {{payment_id}}</p>' +
                emailCtaButton('{{invoice_url}}', 'View receipt')
        ),
        whatsapp_body: 'Hello {{first_name}}, payment receipt for {{seminar_name}} (₹{{payment_amount}}): {{invoice_url}}'
    },
    {
        event_key: 'WAITLIST_CONFIRMED',
        channel: 'both',
        enabled: 1,
        email_subject: 'Waitlist confirmed — {{seminar_name}}',
        email_html: wrapHtml(
            'Waitlist confirmed',
            '<p>Dear {{full_name}},</p><p>You have been confirmed from the waitlist for {{seminar_name}}.</p>' +
                emailCtaButton('{{portal_login_url}}', 'Complete registration')
        ),
        whatsapp_body: 'Hello {{first_name}}, you are confirmed from the waitlist for {{seminar_name}}.'
    }
];

EVENT_KEYS.forEach((key) => {
    if (!DEFAULT_TEMPLATES.find((t) => t.event_key === key)) {
        DEFAULT_TEMPLATES.push({
            event_key: key,
            channel: 'both',
            enabled: 1,
            email_subject: key.replace(/_/g, ' ') + ' — {{seminar_name}}',
            email_html: wrapHtml(
                key.replace(/_/g, ' '),
                '<p>Dear {{full_name}},</p><p>Update for <strong>{{seminar_name}}</strong>.</p>'
            ),
            whatsapp_body: 'Hello {{first_name}}, update for {{seminar_name}}.'
        });
    }
});

DEFAULT_TEMPLATES.forEach((t) => {
    if (t.enabled == null) t.enabled = 1;
});

module.exports = { EVENT_KEYS, DEFAULT_TEMPLATES, wrapHtml, emailCtaButton, SEMINAR, PORTAL_TITLE };
