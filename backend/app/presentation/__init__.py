"""Presentation layer of the composed backend (spec-04).

Dependencies retrieve injected use cases from the composition root and
error handlers map typed failures to safe HTTP errors. Presentation owns
HTTP mapping only: no SQL, provider or SDK detail may leak into a
response body.
"""
