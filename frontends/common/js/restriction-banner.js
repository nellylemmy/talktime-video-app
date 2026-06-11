/**
 * Restriction Banner — Injected into all volunteer dashboard pages.
 * Shows a non-dismissible banner when the volunteer's account is restricted.
 * Relies on window.TalkTimeAuth being initialized (from jwt-auth-utils.js).
 */
(function () {
    'use strict';

    function waitForAuth(cb, attempts) {
        if (window.TalkTimeAuth) return cb();
        if (attempts > 20) return; // give up after ~4s
        setTimeout(function () { waitForAuth(cb, (attempts || 0) + 1); }, 200);
    }

    function renderBanner(data) {
        var perf = data.performance || data;
        if (!perf.isRestricted) return;

        var existing = document.getElementById('restriction-banner');
        if (existing) return;

        var appeal = perf.latestAppeal;
        var appealHTML = '';

        if (appeal && appeal.status === 'pending') {
            appealHTML = '<span style="display:inline-block;margin-top:8px;padding:4px 12px;background:#EEF2FF;color:#3867FF;border-radius:9999px;font-size:13px;font-weight:500;">Appeal submitted — under review</span>';
        } else if (appeal && appeal.status === 'rejected') {
            appealHTML = '<div style="margin-top:8px;padding:8px 12px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;">' +
                '<strong style="color:#7d0000;">Appeal rejected:</strong> ' + escapeHTML(appeal.admin_response || 'No reason provided.') +
                '</div>' +
                '<a href="/volunteer/dashboard/appeal" style="display:inline-block;margin-top:8px;padding:8px 16px;background:#D10100;color:#fff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">Submit New Appeal</a>';
        } else {
            appealHTML = '<a href="/volunteer/dashboard/appeal" style="display:inline-block;margin-top:8px;padding:8px 16px;background:#D10100;color:#fff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">Submit Appeal</a>';
        }

        var banner = document.createElement('div');
        banner.id = 'restriction-banner';
        banner.setAttribute('role', 'alert');
        banner.style.cssText = 'width:100%;background:#FEF2F2;border-left:4px solid #D10100;padding:16px 20px;margin-bottom:16px;border-radius:8px;box-sizing:border-box;';
        banner.innerHTML =
            '<div style="display:flex;align-items:flex-start;gap:12px;">' +
                '<i class="fas fa-ban" style="color:#7d0000;font-size:20px;margin-top:2px;flex-shrink:0;"></i>' +
                '<div style="flex:1;">' +
                    '<div style="font-weight:700;font-size:16px;color:#7d0000;margin-bottom:4px;">Account Restricted</div>' +
                    '<div style="font-size:14px;color:#374151;line-height:1.5;">' +
                        'Your account has been restricted due to <strong>' + (perf.cancelledCalls || 0) + ' cancellation(s)</strong> and <strong>' + (perf.missedCalls || 0) + ' missed call(s)</strong>. You cannot schedule new meetings until this is resolved.' +
                    '</div>' +
                    appealHTML +
                '</div>' +
            '</div>';

        // Insert at top of <main> or after the nav
        var main = document.querySelector('main') || document.querySelector('.dashboard-content') || document.querySelector('.page-content');
        if (main) {
            main.insertBefore(banner, main.firstChild);
        } else {
            document.body.insertBefore(banner, document.body.firstChild);
        }
    }

    function escapeHTML(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function init() {
        waitForAuth(function () {
            window.TalkTimeAuth.makeAuthenticatedRequest('/api/v1/volunteers/performance')
                .then(function (resp) { return resp.json(); })
                .then(function (data) {
                    if (data && (data.performance || data.isRestricted !== undefined)) {
                        renderBanner(data);
                    }
                })
                .catch(function () { /* silent — don't block the page */ });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
