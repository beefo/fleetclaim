namespace FleetClaim.Api;

public record SendEmailRequest(string Email, string? Message = null);
