/**
 * Public homepage — CMS-driven content
 */
(function () {
    function escHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function sanitizeDisplayText(text) {
        if (text == null) return text;
        let s = String(text).trim();
        s = s.replace(/^,\s*/, '');
        s = s.replace(/,\s+and\b/gi, ' and');
        return s;
    }

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el && text != null && String(text).trim()) {
            el.textContent = sanitizeDisplayText(text);
        }
    }

    function setHtml(id, html) {
        const el = document.getElementById(id);
        if (el && html) el.innerHTML = html;
    }

    function mediaUrl(path) {
        if (!path) return '';
        const p = String(path).trim();
        if (p.startsWith('http')) return p;
        if (p.startsWith('/uploads/api/assets/')) return '/api/assets/' + p.slice('/uploads/api/assets/'.length);
        if (p.startsWith('/')) return p;
        return '/uploads/' + p;
    }

    function socialIcon(platform) {
        const p = String(platform || '').toLowerCase();
        if (p === 'youtube') return 'fab fa-youtube';
        if (p === 'facebook') return 'fab fa-facebook';
        if (p === 'instagram') return 'fab fa-instagram';
        if (p === 'twitter' || p === 'x') return 'fab fa-x-twitter';
        if (p === 'linkedin') return 'fab fa-linkedin';
        if (p === 'whatsapp') return 'fab fa-whatsapp';
        return 'fas fa-link';
    }
    window.socialIcon = socialIcon;

    const SOCIAL_BRAND_LOGOS = {
        youtube: { src: '/images/social/youtube.svg', label: 'YouTube' },
        facebook: { src: '/images/social/facebook.svg', label: 'Facebook' },
        instagram: { src: '/images/social/instagram.svg', label: 'Instagram' },
        twitter: { src: '/images/social/x.svg', label: 'X (Twitter)' },
        x: { src: '/images/social/x.svg', label: 'X (Twitter)' },
        linkedin: { src: '/images/social/linkedin.svg', label: 'LinkedIn' },
        whatsapp: { src: '/images/social/whatsapp.svg', label: 'WhatsApp' }
    };

    function socialBrandKey(platform) {
        return String(platform || 'link')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '');
    }

    function socialBrandAsset(platform) {
        const key = socialBrandKey(platform);
        return SOCIAL_BRAND_LOGOS[key] || { src: '', label: '' };
    }

    function normalizePillarIcon(icon) {
        const raw = String(icon || 'fa-star').trim().replace(/^fas\s+/, '');
        const map = {
            'fa-hands-holding-heart': 'fa-hand-holding-heart',
            'hands-holding-heart': 'fa-hand-holding-heart',
            'hand-holding-heart': 'fa-hand-holding-heart'
        };
        const key = raw.replace(/^fa-/, '');
        return map[raw] || map[key] || (raw.startsWith('fa-') ? raw : 'fa-' + key);
    }

    function socialDisplayLabel(platform, cmsLabel) {
        const brand = socialBrandAsset(platform);
        const custom = String(cmsLabel || '').trim();
        if (!custom) return brand.label || 'Follow us';
        if (custom.length > 28) return brand.label || custom;
        if (brand.label && /foundation|vaidya|gogate|memorial/i.test(custom)) return brand.label;
        return custom;
    }

    function renderPillLink(url, platform, cmsLabel, extraClass) {
        const brand = socialBrandAsset(platform);
        const label = socialDisplayLabel(platform, cmsLabel);
        const faCls = escHtml(socialIcon(platform));
        const iconHtml = brand.src
            ? '<span class="social-brand-wrap">' +
              '<img class="social-brand-logo" src="' +
              escHtml(brand.src) +
              '" alt="" width="36" height="36" decoding="async" loading="lazy" onerror="this.style.display=\'none\';var n=this.nextElementSibling;if(n)n.style.display=\'inline-flex\'">' +
              '<i class="' +
              faCls +
              ' social-brand-fa" style="display:none" aria-hidden="true"></i></span>'
            : '<i class="' + faCls + '" aria-hidden="true"></i>';
        return (
            '<a href="' +
            escHtml(url) +
            '" target="_blank" rel="noopener noreferrer" class="' +
            escHtml(extraClass || 'social-link-btn') +
            '" aria-label="' +
            escHtml(label) +
            '">' +
            iconHtml +
            '<span class="social-pill-label">' +
            escHtml(label) +
            '</span></a>'
        );
    }

    window.renderSocialLinks = function renderSocialLinks(cms) {
        const links = Array.isArray(cms && cms.socialLinks) ? cms.socialLinks.filter((l) => l && l.url) : [];
        const html = links.length
            ? links
                  .map((l) => {
                      const p = String(l.platform || 'link').toLowerCase().replace(/[^a-z0-9]+/g, '_');
                      const pillClass = 'social-pill social-pill--' + (p || 'link');
                      return renderPillLink(
                          l.url,
                          l.platform,
                          l.label || l.platform || 'Follow',
                          'social-link-btn ' + pillClass
                      );
                  })
                  .join('')
            : '';
        ['social-follow', 'footer-social'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (!html) {
                el.innerHTML = '';
                el.classList.add('hidden');
                return;
            }
            el.classList.remove('hidden');
            el.innerHTML = html;
        });
    }

    window.__publicSchedules = [];

    function renderSpeakers(list) {
        const section = document.getElementById('speakers-section');
        const grid = document.getElementById('speakers-grid');
        if (!grid) return;
        const speakers = (list || []).filter((s) => s && (s.name || s.image || s.imagePath));
        if (section) section.classList.remove('hidden');
        if (!speakers.length) {
            grid.innerHTML =
                '<p class="speakers-placeholder muted" style="text-align:center;max-width:42rem;margin:0 auto;padding:24px 16px;">Faculty lineup will be announced shortly. Session speakers also appear on the <a href="#" data-nav-section="schedule">programme</a> page.</p>';
            return;
        }
        // Allow speaker photos on all sites (removed autism-kids restriction)
        const autismNoPhotos = false;
        grid.innerHTML = speakers
            .map((s) => {
                const imgSrc = mediaUrl(s.image || s.imagePath);
                const initial = escHtml(
                    String(s.name || '?')
                        .trim()
                        .split(/\s+/)
                        .map((w) => w[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase() || '?'
                );
                const avatar = autismNoPhotos
                    ? '<div class="speaker-avatar ak-speaker-initial" aria-hidden="true">' + initial + '</div>'
                    : imgSrc
                      ? '<div class="speaker-photo-wrap"><img src="' +
                        escHtml(imgSrc) +
                        '" alt="' +
                        escHtml(s.name || 'Speaker') +
                        '" class="speaker-photo" loading="lazy"></div>'
                      : '<div class="speaker-avatar" aria-hidden="true"><i class="fas fa-user-md"></i></div>';
                const seminarLine = s.seminar || s.seminarTitle;
                return (
                    '<article class="speaker-card">' +
                    avatar +
                    '<h3>' +
                    escHtml(s.name || '') +
                    '</h3>' +
                    (s.role ? '<p class="speaker-role">' + escHtml(s.role) + '</p>' : '') +
                    (seminarLine ? '<p class="speaker-seminar">' + escHtml(seminarLine) + '</p>' : '') +
                    (s.org ? '<p class="speaker-org">' + escHtml(s.org) + '</p>' : '') +
                    '</article>'
                );
            })
            .join('');
    }

    const DEFAULT_FEATURES = [
        { icon: 'fa-microphone-alt', title: 'Curated faculty', text: 'Sessions led by trusted Ayurvedic clinicians and researchers.' },
        { icon: 'fa-certificate', title: 'Verified credentials', text: 'Participation and certificate records with transparent verification.' },
        { icon: 'fa-trophy', title: 'Clinical excellence', text: 'Case-focused learning built around practical, modern workflows.' },
        { icon: 'fa-network-wired', title: 'Nationwide network', text: 'Collaborate with peers, institutions, and mentors across India.' }
    ];

    const AUTISM_FEATURES = [
        { icon: 'fa-heart', title: 'Warm & welcoming', text: 'A safe, friendly programme for children, families, and schools.' },
        { icon: 'fa-palette', title: 'Creative fun', text: 'Join competitions — share drawings, photos, videos, and stories.' },
        { icon: 'fa-ticket-alt', title: 'Simple e-tickets', text: 'Sign up, pre-register, and download your pass in a few clicks.' },
        { icon: 'fa-hands-helping', title: 'Helpful team', text: 'Our volunteers guide you at every step — just ask!' }
    ];

    function cmsResolveHomePillarsForSite(pillars) {
        const list = Array.isArray(pillars) ? pillars.filter((p) => p && (p.title || p.text)) : [];
        if (list.length) return list;
        return [
            {
                icon: 'fa-lightbulb',
                iconTone: 'blue',
                title: 'Awareness',
                text: 'Learn about autism with simple talks, activities, and resources for your school and community.'
            },
            {
                icon: 'fa-hand-holding-heart',
                iconTone: 'violet',
                title: 'Inclusion',
                text: "Celebrate every child's strengths. Our programme is designed to be welcoming, safe, and joyful for all."
            },
            {
                icon: 'fa-star',
                iconTone: 'mint',
                title: 'Celebration',
                text: 'Creative competitions, certificates, and community events — share talents and make new friends.'
            }
        ];
    }

    function renderHomePillars(pillars) {
        const grid = document.querySelector('.ak-pillars-grid');
        if (!grid || !Array.isArray(pillars) || !pillars.length) return;
        grid.innerHTML = pillars
            .map((p) => {
                const tone = ['blue', 'violet', 'mint'].includes(String(p.iconTone || '').toLowerCase())
                    ? String(p.iconTone).toLowerCase()
                    : 'blue';
                const icon = escHtml(normalizePillarIcon(p.icon));
                return (
                    '<article class="ak-pillar">' +
                    '<div class="ak-pillar-icon ' +
                    tone +
                    '"><i class="fas ' +
                    icon +
                    '" aria-hidden="true"></i></div>' +
                    '<h3>' +
                    escHtml(p.title) +
                    '</h3>' +
                    '<p>' +
                    escHtml(p.text) +
                    '</p></article>'
                );
            })
            .join('');
    }

    const DEFAULT_HOME_JOURNEY = {
        title: 'How it works — easy peasy!',
        subtitle: 'Four simple steps from sign-up to your e-ticket — all in your dashboard.',
        steps: [
            { icon: 'fa-user-plus', title: '1. Sign up', text: 'Create your free account on this website in a few minutes.' },
            { icon: 'fa-clipboard-list', title: '2. Pre-register', text: 'Tell us you are coming — open your dashboard after login.' },
            { icon: 'fa-palette', title: '3. Register & compete', text: 'Complete registration and upload competition entries if you like.' },
            { icon: 'fa-ticket-alt', title: '4. E-ticket', text: 'Download your e-ticket and bring it on event day. That is it!' }
        ]
    };

    function resolveHomeJourney(raw) {
        const d = DEFAULT_HOME_JOURNEY;
        const j = raw && typeof raw === 'object' ? raw : {};
        const stepsRaw = Array.isArray(j.steps) ? j.steps.filter((s) => s && (s.title || s.text)) : [];
        return {
            title: (j.title || '').trim() || d.title,
            subtitle: (j.subtitle || '').trim() || d.subtitle,
            steps: stepsRaw.length ? stepsRaw : d.steps
        };
    }

    const DEFAULT_HOME_BENTO = {
        title: 'Everything in one friendly place',
        subtitle: 'Register online, track your progress, and stay updated — built for families and schools.',
        cards: [
            {
                icon: 'fa-clipboard-check',
                iconStyle: 'background:#dbeafe;color:#2563eb',
                title: 'Pre-register & register',
                text: 'After you create an account, open your dashboard to pre-register, complete full registration, and upload competition entries when you are ready.',
                wide: true
            },
            {
                icon: 'fa-qrcode',
                iconStyle: 'background:#ede9fe;color:#7c3aed',
                title: 'E-ticket',
                text: 'Download your pass with a QR code — show it at check-in on event day.'
            },
            {
                icon: 'fa-award',
                iconStyle: 'background:#d1fae5;color:#059669',
                title: 'Certificates',
                text: 'Verify participation certificates online anytime from the Certificate page.'
            },
            {
                icon: 'fa-bullhorn',
                iconStyle: 'background:#fef3c7;color:#d97706',
                title: 'Live updates',
                text: 'Watch the announcement ticker and official notices for schedule changes and reminders.',
                tall: true
            },
            {
                icon: 'fa-envelope',
                iconStyle: 'background:#ffe4e6;color:#e11d48',
                title: 'Need help?',
                text: 'Use Contact us — our team replies to registration and general questions.'
            }
        ]
    };

    const DEFAULT_HOME_STATS = [
        { value: 'Free', label: 'Registration always' },
        { value: '4', label: 'Steps to your e-ticket' },
        { value: '100+', label: 'Families welcome' },
        { value: '24/7', label: 'Online portal' }
    ];

    function resolveHomeBento(raw) {
        const d = DEFAULT_HOME_BENTO;
        const b = raw && typeof raw === 'object' ? raw : {};
        const cardsRaw = Array.isArray(b.cards) ? b.cards.filter((c) => c && (c.title || c.text)) : [];
        return {
            title: (b.title || '').trim() || d.title,
            subtitle: (b.subtitle || '').trim() || d.subtitle,
            cards: cardsRaw.length ? cardsRaw : d.cards
        };
    }

    function resolveHomeStats(raw) {
        const list = Array.isArray(raw) ? raw.filter((s) => s && (s.value || s.label)) : [];
        return list.length ? list : DEFAULT_HOME_STATS;
    }

    function renderHomeJourney(journey) {
        const resolved = resolveHomeJourney(journey);
        const titleEl = document.getElementById('ak-journey-title');
        const head = document.querySelector('.ak-journey-head');
        if (titleEl) titleEl.textContent = sanitizeDisplayText(resolved.title);
        else if (head) {
            const h2 = head.querySelector('h2');
            if (h2) h2.textContent = sanitizeDisplayText(resolved.title);
        }
        const subEl = head && head.querySelector('p');
        if (subEl) subEl.textContent = sanitizeDisplayText(resolved.subtitle);
        const stepsEl = document.querySelector('.ak-steps');
        const steps = resolved.steps;
        if (!stepsEl || !steps.length) return;
        stepsEl.innerHTML = steps
            .map(
                (s) =>
                    '<article class="ak-step">' +
                    '<div class="ak-step-icon"><i class="fas ' +
                    escHtml(s.icon || 'fa-circle') +
                    '" aria-hidden="true"></i></div>' +
                    '<h3>' +
                    escHtml(s.title) +
                    '</h3><p>' +
                    escHtml(s.text) +
                    '</p></article>'
            )
            .join('');
        stepsEl.querySelectorAll('.ak-step').forEach((el) => el.classList.add('ak-visible'));
        if (typeof window.akShowJourneySteps === 'function') window.akShowJourneySteps();
    }

    function renderHomeBento(bento) {
        const resolved = resolveHomeBento(bento);
        const titleEl = document.getElementById('ak-bento-title');
        const head = document.querySelector('.ak-bento-head');
        if (titleEl) titleEl.textContent = sanitizeDisplayText(resolved.title);
        else if (head) {
            const h2 = head.querySelector('h2');
            if (h2) h2.textContent = sanitizeDisplayText(resolved.title);
        }
        const subEl = head && head.querySelector('p');
        if (subEl) subEl.textContent = sanitizeDisplayText(resolved.subtitle);
        const grid = document.querySelector('.ak-bento-grid');
        const cards = resolved.cards;
        if (!grid || !cards.length) return;
        grid.innerHTML = cards
            .map((c) => {
                const cls = ['ak-bento-card', c.wide ? 'wide' : '', c.tall ? 'tall' : ''].filter(Boolean).join(' ');
                const style = c.iconStyle ? ' style="' + escHtml(c.iconStyle) + '"' : '';
                return (
                    '<article class="' +
                    cls +
                    '">' +
                    '<div class="ak-bento-icon"' +
                    style +
                    '><i class="fas ' +
                    escHtml(c.icon || 'fa-star') +
                    '"></i></div>' +
                    '<h3>' +
                    escHtml(c.title) +
                    '</h3><p>' +
                    escHtml(c.text) +
                    '</p></article>'
                );
            })
            .join('');
    }

    function renderHomeCtaBand(cta) {
        if (!cta) return;
        const inner = document.querySelector('.ak-cta-band-inner');
        if (!inner) return;
        const h2 = inner.querySelector('h2');
        const p = inner.querySelector('p');
        const btn = inner.querySelector('button');
        if (h2 && cta.title) h2.textContent = sanitizeDisplayText(cta.title);
        if (p && cta.subtitle) p.textContent = sanitizeDisplayText(cta.subtitle);
        if (btn && cta.buttonText) {
            const icon = btn.querySelector('i');
            btn.innerHTML =
                (icon ? icon.outerHTML + ' ' : '<i class="fas fa-user-plus" aria-hidden="true"></i> ') +
                escHtml(cta.buttonText);
        }
    }

    function renderFeatureCards(cards) {
        const featGrid = document.getElementById('feature-cards-grid');
        if (!featGrid) return;
        const autismSite = document.body && document.body.classList.contains('ak-portal');
        const list =
            cards && cards.length
                ? cards
                : autismSite
                  ? AUTISM_FEATURES
                  : DEFAULT_FEATURES;
        featGrid.innerHTML = list
            .map((c) => {
                const icon = escHtml(c.icon || 'fa-star');
                return (
                    '<article class="feature-card">' +
                    '<div class="card-icon"><i class="fas ' +
                    icon +
                    '"></i></div>' +
                    '<h3>' +
                    escHtml(c.title) +
                    '</h3><p>' +
                    escHtml(c.text) +
                    '</p></article>'
                );
            })
            .join('');
    }

    function applyAutismHeroFromCms(cms) {
        const hero = (cms && cms.hero) || {};
        if (!document.querySelector('.ak-hero-v2-copy')) return;
        const badge = document.querySelector('.ak-hero-v2-badge');
        if (badge && hero.eyebrow) {
            badge.innerHTML =
                '<i class="fas fa-puzzle-piece" aria-hidden="true"></i> ' + escHtml(hero.eyebrow);
        }
        const h1 = document.querySelector('.ak-hero-v2-copy h1');
        if (h1 && hero.title) h1.textContent = sanitizeDisplayText(hero.title);
        const lead = document.querySelector('.ak-hero-v2-lead');
        if (lead && hero.subtitle) lead.textContent = sanitizeDisplayText(hero.subtitle);
        const primaryBtn = document.querySelector('.ak-hero-v2-cta .ak-btn-v2-primary');
        if (primaryBtn && hero.ctaPrimary) {
            const icon = primaryBtn.querySelector('i');
            primaryBtn.innerHTML =
                (icon ? icon.outerHTML + ' ' : '<i class="fas fa-rocket" aria-hidden="true"></i> ') +
                escHtml(hero.ctaPrimary);
        }
        const ghostBtn = document.querySelector('.ak-hero-v2-cta .ak-btn-v2-ghost');
        if (ghostBtn && hero.ctaSecondary) {
            const icon = ghostBtn.querySelector('i');
            ghostBtn.innerHTML =
                (icon ? icon.outerHTML + ' ' : '<i class="fas fa-door-open" aria-hidden="true"></i> ') +
                escHtml(hero.ctaSecondary);
        }
    }

    window.applySiteCms = function applySiteCms(cms) {
        if (!cms) return;
        window.__homeCms = cms;

        const tickerEl = document.getElementById('tickerText');
        if (tickerEl && cms.tickerText) tickerEl.textContent = cms.tickerText;
        setText('hero-title', cms.hero && cms.hero.title);
        setText('hero-subtitle', cms.hero && cms.hero.subtitle);
        const vEl = document.getElementById('hero-venue');
        if (vEl && cms.hero && cms.hero.venue) {
            vEl.innerHTML =
                '<i class="fas fa-location-dot"></i> ' + escHtml(cms.hero.venue);
        }
        setText('hero-cta-primary', cms.hero && cms.hero.ctaPrimary);
        setText('hero-cta-secondary', cms.hero && cms.hero.ctaSecondary);
        applyAutismHeroFromCms(cms);
        setText('schedule-page-title', cms.schedulePage && cms.schedulePage.title);
        setText('schedule-page-subtitle', cms.schedulePage && cms.schedulePage.subtitle);
        setText('footer-tagline', cms.footer && cms.footer.tagline);
        setText('footer-copyright', cms.footer && cms.footer.copyright);
        const foot = cms.footer || {};
        const header = cms.siteHeader || {};
        const logoH1 = document.getElementById('site-header-foundation');
        const logoP = document.getElementById('site-header-programme');
        if (logoH1) {
            const name =
                (header.foundationName || '').trim() ||
                'Vaidya Gogate Memorial Foundation';
            logoH1.textContent = name;
        }
        if (logoP) {
            const sub =
                (header.programmeName || '').trim() ||
                'Autism Awareness Programme';
            logoP.textContent = sub;
        }
        setText('footer-foundation-heading', (header.foundationName || '').trim() || 'Vaidya Gogate Memorial Foundation');
        setText('footer-explore-title', foot.exploreTitle || 'Explore');
        setText('footer-doctor-title', foot.doctorTitle || 'Doctor access');
        const contactCol = document.querySelector('.footer-col h4');
        if (foot.contactTitle) {
            const contactH = document.getElementById('footer-contact-heading');
            if (contactH) contactH.textContent = foot.contactTitle;
        }
        const creditEl = document.querySelector('.footer-credit');
        if (creditEl && foot.creditHtml) creditEl.innerHTML = foot.creditHtml;
        const exploreUl = document.getElementById('footer-explore-links');
        if (exploreUl && Array.isArray(foot.exploreLinks) && foot.exploreLinks.length) {
            exploreUl.innerHTML = foot.exploreLinks
                .map(
                    (l) =>
                        '<li><a href="#" data-menu-key="' +
                        escHtml(l.section || 'home') +
                        '" onclick="showSection(\'' +
                        escHtml(l.section || 'home') +
                        '\'); return false;">' +
                        escHtml(l.label) +
                        '</a></li>'
                )
                .join('');
        }
        const doctorUl = document.getElementById('footer-doctor-links');
        if (doctorUl && Array.isArray(foot.doctorLinks) && foot.doctorLinks.length) {
            doctorUl.innerHTML = foot.doctorLinks
                .map((l) => {
                    const action = l.action === 'signup' ? 'openRegisterModal()' : 'openAuthModal(\'login\')';
                    return (
                        '<li><a href="#" onclick="' +
                        action +
                        '; return false;">' +
                        escHtml(l.label) +
                        '</a></li>'
                    );
                })
                .join('');
        }

        const top = cms.topBar || {};
        setText('top-email', top.email);
        setText('top-phone', top.phone);
        setText('top-date', top.dateLine);
        const emailLink = document.getElementById('top-email-link');
        const phoneLink = document.getElementById('top-phone-link');
        if (emailLink && top.email) {
            emailLink.href = 'mailto:' + String(top.email).trim();
        }
        if (phoneLink && top.phone) {
            const digits = String(top.phone).replace(/\D/g, '');
            phoneLink.href = digits ? 'tel:+' + (digits.length === 10 ? '91' + digits : digits) : '#';
        }

        const contact = cms.contact || {};
        ['contact-address', 'contact-page-address'].forEach((id) => setText(id, contact.address));
        ['contact-phone', 'contact-page-phone'].forEach((id) => setText(id, contact.phone));
        ['contact-email', 'contact-page-email'].forEach((id) => setText(id, contact.email));
        if (contact.hours) {
            setText('contact-hours', contact.hours);
            const hl = document.getElementById('contact-hours-line');
            if (hl) hl.classList.remove('hidden');
        }

        const stats = Array.isArray(cms.heroStats) ? cms.heroStats : [];
        const statsWrap = document.getElementById('hero-stats');
        if (statsWrap && stats.length) {
            statsWrap.innerHTML = stats
                .map(
                    (s) =>
                        `<div class="stat-item"><h3>${escHtml(s.value)}</h3><p>${escHtml(s.label)}</p></div>`
                )
                .join('');
        }

        const homeStats = resolveHomeStats(cms.homeStats);
        const statsGrid = document.getElementById('vg-stats-grid');
        if (statsGrid && homeStats.length) {
            statsGrid.innerHTML = homeStats
                .map(
                    (s) =>
                        '<div class="vg-stat"><strong>' +
                        escHtml(s.value) +
                        '</strong><span>' +
                        escHtml(s.label) +
                        '</span></div>'
                )
                .join('');
        }

        const fs = cms.featuresSection || {};
        const featTitle = fs.title || cms.featuresSectionTitle;
        const featSub = fs.subtitle || cms.featuresSubtitle;
        if (featTitle) setText('section-features-title', featTitle);
        if (featSub) setText('section-features-subtitle', featSub);
        renderHomePillars(cmsResolveHomePillarsForSite(cms.homePillars));
        renderHomeJourney(resolveHomeJourney(cms.homeJourney));
        renderHomeBento(resolveHomeBento(cms.homeBento));
        renderHomeCtaBand(cms.homeCtaBand);
        const helpBanner = document.querySelector('.help-banner');
        if (helpBanner && cms.helpBanner) helpBanner.innerHTML = cms.helpBanner;
        if (helpBanner) helpBanner.classList.add('ak-visible', 'is-visible');
        const featureCardsRaw = Array.isArray(cms.featureCards) ? cms.featureCards.filter((c) => c && (c.title || c.text)) : [];
        renderFeatureCards(featureCardsRaw.length ? featureCardsRaw : null);
        renderSpeakers(cms.speakers);

        const faqSection = document.getElementById('faq-section');
        const faqRoot = document.getElementById('faq-list');
        const faqs = Array.isArray(cms.faq) ? cms.faq.filter((f) => f && (f.q || f.a)) : [];
        if (faqRoot && faqs.length) {
            if (document.body.classList.contains('ak-v2') && typeof window.akRenderFaq === 'function') {
                window.akRenderFaq(faqs);
            } else {
                faqRoot.innerHTML = faqs
                    .map(
                        (f, i) => `
                <details class="faq-item" ${i === 0 ? 'open' : ''}>
                    <summary>${escHtml(f.q)}</summary>
                    <p>${escHtml(f.a)}</p>
                </details>`
                    )
                    .join('');
            }
            if (faqSection) faqSection.classList.remove('hidden');
        }

        const heroPanel = document.getElementById('hero-image-panel');
        if (heroPanel && cms.hero && cms.hero.image) {
            heroPanel.innerHTML = `<img src="${escHtml(mediaUrl(cms.hero.image))}" alt="" class="hero-photo">`;
        }

        const bw = document.getElementById('site-banner-wrap');
        if (bw) {
            if (cms.bannerImage) {
                bw.classList.remove('hidden');
                bw.style.display = 'block';
                bw.innerHTML = `<img src="${escHtml(mediaUrl(cms.bannerImage))}" alt="">`;
            } else {
                bw.classList.add('hidden');
                bw.innerHTML = '';
            }
        }

        const announceHeading = document.getElementById('scrolling-announce-heading');
        if (announceHeading && cms.scrollingAnnounceHeading) {
            announceHeading.textContent = cms.scrollingAnnounceHeading;
        }
        if (typeof renderHomeSlider === 'function') renderHomeSlider(cms.slides || []);
        const onCongressSite = document.body && document.body.classList.contains('congress-site');
        if (!onCongressSite && typeof renderScrollingAnnouncements === 'function') {
            renderScrollingAnnouncements(cms.scrollingAnnouncements || []);
        }
        if (typeof renderReviewsMarquee === 'function') renderReviewsMarquee(cms.reviews || []);
        renderSocialLinks(cms);
        if (typeof renderAboutGallerySocial === 'function') renderAboutGallerySocial(cms);
        try {
            document.dispatchEvent(new CustomEvent('ak-cms-ready', { detail: cms }));
        } catch (_) {
            /* ignore */
        }
    };

    function parseScheduleDate(value) {
        if (!value) return null;
        if (window.PortalDateTime && window.PortalDateTime.parse) {
            return window.PortalDateTime.parse(value);
        }
        const s = String(value).trim();
        if (!s) return null;
        const d = new Date(/Z$|[+-]\d{2}/i.test(s) ? s : s.replace(' ', 'T') + (s.includes('+') ? '' : '+05:30'));
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function formatScheduleWhen(startVal, endVal) {
        if (window.PortalDateTime && window.PortalDateTime.format) {
            const a = window.PortalDateTime.format(startVal);
            const b = endVal ? window.PortalDateTime.format(endVal) : '';
            if (!a) return 'Schedule to be announced';
            return b ? `${a} – ${b}` : a;
        }
        const start = parseScheduleDate(startVal);
        const end = parseScheduleDate(endVal);
        if (!start) return 'Schedule to be announced';
        const tz = { timeZone: 'Asia/Kolkata' };
        const datePart = start.toLocaleDateString('en-IN', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            ...tz
        });
        const t1 = start.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, ...tz });
        const t2 = end ? end.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, ...tz }) : '';
        return t2 ? `${datePart} · ${t1} – ${t2}` : `${datePart} · ${t1}`;
    }

    function formatScheduleCell(iso, dateOnly) {
        if (!iso) return '—';
        if (window.PortalDateTime && window.PortalDateTime.format) {
            if (dateOnly && window.PortalDateTime.formatEvent) {
                return window.PortalDateTime.formatEvent(iso);
            }
            return window.PortalDateTime.format(iso);
        }
        const d = parseScheduleDate(iso);
        if (!d) return '—';
        const tz = { timeZone: 'Asia/Kolkata' };
        if (dateOnly) {
            return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', ...tz });
        }
        return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, ...tz });
    }

    window.loadEventSchedulesPublic = async function loadEventSchedulesPublic() {
        try {
            const res = await fetch('/api/event-schedules');
            const schedules = await res.json();
            if (!res.ok || !Array.isArray(schedules)) return;
            window.__publicSchedules = schedules;

            const dropdown = document.getElementById('event-schedule-dropdown');
            if (dropdown) {
                dropdown.innerHTML = '<option value="">Select a session</option>';
                schedules.forEach((s) => {
                    const opt = document.createElement('option');
                    opt.value = String(s.id);
                    const when = s.start_time ? formatScheduleCell(s.start_time, false) : '';
                    opt.textContent = (s.title || 'Session') + (when ? ` (${when})` : '');
                    dropdown.appendChild(opt);
                });
            }

            const tbody = document.getElementById('schedule-table-body');
            if (tbody) {
                tbody.innerHTML = '';
                if (!schedules.length) {
                    tbody.innerHTML =
                        '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--muted);">Programme schedule will be published soon.</td></tr>';
                    return;
                }
                schedules.forEach((s) => {
                    const start = parseScheduleDate(s.start_time);
                    const tr = document.createElement('tr');
                    tr.innerHTML = '<td></td><td></td><td></td><td></td>';
                    tr.cells[0].textContent = formatScheduleCell(s.start_time, true);
                    tr.cells[1].textContent = formatScheduleCell(s.start_time, false);
                    tr.cells[2].textContent = s.title || '—';
                    tr.cells[3].textContent = s.speaker_name || '—';
                    tbody.appendChild(tr);
                });
            }
        } catch (e) {
            console.error(e);
        }
    };

    window.displayEventScheduleDetail = function displayEventScheduleDetail() {
        const dropdown = document.getElementById('event-schedule-dropdown');
        const detail = document.getElementById('event-schedule-detail');
        if (!dropdown || !detail) return;
        const id = dropdown.value;
        if (!id) {
            detail.style.display = 'none';
            return;
        }
        const schedule = (window.__publicSchedules || []).find((x) => String(x.id) === String(id));
        if (!schedule) {
            detail.style.display = 'none';
            return;
        }
        detail.innerHTML = `
            <h4 style="margin-bottom:10px;font-size:1.05rem;">${escHtml(schedule.title)}</h4>
            ${schedule.seminar_title ? `<p><strong>Seminar:</strong> ${escHtml(schedule.seminar_title)}</p>` : ''}
            <p><strong>When:</strong> ${escHtml(formatScheduleWhen(schedule.start_time, schedule.end_time))}</p>
            <p><strong>Where:</strong> ${escHtml(schedule.location && String(schedule.location).trim() ? schedule.location : 'To be announced')}</p>
            ${schedule.speaker_name ? `<p><strong>Speaker:</strong> ${escHtml(schedule.speaker_name)}</p>` : ''}
            ${schedule.speaker_bio ? `<p>${escHtml(schedule.speaker_bio)}</p>` : ''}
            ${schedule.description ? `<p>${escHtml(schedule.description)}</p>` : ''}`;
        detail.style.display = 'block';
    };

    window.applyPortalUrls = async function applyPortalUrls() {
        try {
            const res = await fetch('/api/public/portal-urls');
            const u = await res.json();
            window.__portalUrls = u;
        } catch (_) {}
    };

    window.loadOpenSeminarsStrip = async function loadOpenSeminarsStrip() {
        const wrap = document.getElementById('open-seminars-strip');
        const section = document.getElementById('seminars-section');
        if (!wrap) return;
        try {
            const res = await fetch('/api/seminars?bucket=current');
            const payload = await res.json();
            const list = payload.seminars || [];
            if (!list.length) {
                wrap.innerHTML =
                    '<p class="muted">No seminars are open for registration at the moment. Please check back soon.</p>';
                return;
            }
            wrap.innerHTML = list
                .map((s) => {
                    const ed =
                        s.event_date && window.PortalDateTime && window.PortalDateTime.formatEvent
                            ? window.PortalDateTime.formatEvent(s.event_date)
                            : s.event_date
                              ? String(s.event_date)
                              : '';
                    return (
                        '<article class="seminar-pill">' +
                        '<h4>' +
                        escHtml(s.title || 'Seminar') +
                        '</h4>' +
                        '<p>' +
                        escHtml(s.description || '') +
                        '</p>' +
                        (ed ? '<p class="seminar-meta"><i class="fas fa-calendar"></i> ' + escHtml(ed) + '</p>' : '') +
                        '<a href="/dashboard" class="btn-primary" style="margin-top:auto;text-align:center;">Register</a>' +
                        '</article>'
                    );
                })
                .join('');
            if (section) section.classList.remove('hidden');
        } catch (e) {
            console.error(e);
            wrap.innerHTML = '<p class="muted">Could not load seminars.</p>';
        }
    };
})();
