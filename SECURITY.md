# Security Policy

This policy explains how to report a security problem in Senyar, the working register for Qatar's National Information Assurance Standard.

## Supported versions

Security fixes are made on the `main` branch and shipped in the next release. Only the latest release is supported, so please test against it or against `main`.

## Reporting a vulnerability

Please do not report a security problem in a public issue, discussion or pull request.

Report it privately with GitHub private vulnerability reporting: open the [Security tab](https://github.com/SiteQ8/Senyar/security) of this repository and choose **Report a vulnerability**. The report stays private between you and the maintainer until a fix is published.

A useful report includes:

- what the problem is and where it is (file, page, tool or endpoint)
- the steps to reproduce it
- the impact you expect
- the version or commit you tested

## What happens next

1. You receive an acknowledgement within 7 days.
2. The report is confirmed, or declined with the reason.
3. A confirmed problem is fixed on `main` and shipped in a new release, and a GitHub security advisory is published.
4. You are credited in the advisory unless you ask to stay anonymous.

## Scope

In scope:

- the site at https://senyar.3li.info and its source in this repository
- the MCP server in `mcp/`
- the build and data scripts

Out of scope:

- denial of service and load testing
- social engineering
- automated scanner output without a demonstrated impact
- vulnerabilities in third party services or dependencies, which should be reported to their maintainers
- corrections to control text or crosswalk mappings, which are content issues: please open a normal issue for those

<div dir="rtl">

## سياسة الأمن

نرحّب بالإبلاغ عن الثغرات الأمنية في سنيار ونتعامل مع كل بلاغ بسرية، لذا نرجو ألا تُنشر أي مشكلة أمنية في بلاغ عام أو نقاش أو طلب دمج، بل يُبلَّغ عنها عبر خاصية الإبلاغ الخاص عن الثغرات في GitHub بفتح [تبويب Security](https://github.com/SiteQ8/Senyar/security) في هذا المستودع واختيار Report a vulnerability، فيبقى البلاغ سريًا بينك وبين المشرف على المشروع حتى يُنشر الإصلاح.

يتضمن البلاغ المفيد وصف المشكلة وموضعها وخطوات إعادة إنتاجها وأثرها المتوقع والإصدار أو الإيداع الذي اختبرته، ثم يصلك إشعار بالاستلام خلال سبعة أيام، وبعد التحقق إما أن يُؤكَّد البلاغ وإما أن يُرفض مع بيان السبب، فإن تأكد عولجت المشكلة في الفرع الرئيسي وصدر إصدار جديد بالإصلاح ونُشرت نشرة أمنية في GitHub يُنسب فيها الفضل إليك ما لم تطلب عدم ذكر اسمك.

تُجرى الإصلاحات الأمنية على الفرع الرئيسي main وتُطرح في الإصدار التالي، والدعم مقصور على أحدث إصدار لذا نرجو الاختبار عليه أو على الفرع الرئيسي.

ويشمل نطاق هذه السياسة الموقع senyar.3li.info وشيفرته في هذا المستودع وخادم MCP في مجلد mcp وأدوات البناء والبيانات، ولا يشمل هجمات حجب الخدمة واختبارات الحِمل ولا الهندسة الاجتماعية ولا نتائج أدوات الفحص الآلي التي لا يثبت لها أثر ولا ثغرات خدمات الطرف الثالث ومكتباته لأن الإبلاغ عنها يكون لدى القائمين عليها، ولا تصحيح نص ضابط أو مقابلة بين الأطر لأنه مسألة محتوى يُفتح لها بلاغ عادي.

</div>
