from flask import (
    Flask,
    render_template,
    request,
    redirect,
    url_for,
    session,
    flash,
)
import json
import os
import uuid
from werkzeug.utils import secure_filename
import datetime

# Initialize Flask application
app = Flask(__name__)
app.secret_key = os.urandom(24)
app.config["UPLOAD_FOLDER"] = "uploads"
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16MB max file size
app.config["UPLOADS_METADATA"] = "uploads/metadata.json"

# Create uploads directory if it doesn't exist
os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)


@app.route("/")
def index():
    """Render the main landing page."""
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload_file():
    """
    Handle file uploads.
    
    Validates that the uploaded file is a JSON file, saves it with a unique ID,
    and stores metadata about the upload.
    """
    if "file" not in request.files:
        flash("No file part")
        return redirect(request.url)

    file = request.files["file"]

    if file.filename == "":
        flash("No selected file")
        return redirect(request.url)

    if file and file.filename.endswith(".json"):
        try:
            # Get the name from the form
            display_name = request.form.get("name", "").strip()
            if not display_name:
                display_name = file.filename

            # Save the file with a unique filename
            filename = secure_filename(file.filename)
            file_id = str(uuid.uuid4())
            saved_filename = f"{file_id}_{filename}"
            filepath = os.path.join(app.config["UPLOAD_FOLDER"], saved_filename)
            file.save(filepath)

            # Update metadata
            metadata = get_uploads_metadata()
            metadata[file_id] = {
                "id": file_id,
                "name": display_name,
                "original_filename": filename,
                "filepath": filepath,
                "uploaded_at": datetime.datetime.now().isoformat(),
                "size": os.path.getsize(filepath),
            }
            save_uploads_metadata(metadata)

            # Store just the file ID in the session
            session["file_id"] = file_id
            session["filepath"] = filepath

            return redirect(url_for("dashboard"))
        except Exception as e:
            flash(f"Error processing file: {str(e)}")
            return redirect(request.url)
    else:
        flash("Please upload a JSON file")
        return redirect(request.url)


def get_auth_details():
    """
    Load and process the authorization details from the saved file.
    
    Returns:
        dict: Processed IAM authorization details or None if file not found or error occurs
    """
    if "filepath" not in session:
        return None

    filepath = session["filepath"]

    if not os.path.exists(filepath):
        return None

    try:
        with open(filepath, "r") as f:
            auth_details = json.load(f)

        return process_auth_details(auth_details)
    except Exception as e:
        print(f"Error loading auth details: {str(e)}")
        return None


def process_auth_details(auth_details):
    """
    Process and organize the IAM authorization details.
    
    Extracts and organizes users, roles, policies, and groups from the raw IAM data.
    
    Args:
        auth_details (dict): Raw IAM authorization details
        
    Returns:
        dict: Organized IAM data with users, roles, policies, and groups
    """
    users = {}
    roles = {}
    policies = {}
    groups = {}

    # Process users
    for user in auth_details.get("UserDetailList", []):
        user_id = user.get("UserId")
        users[user_id] = {
            "UserId": user_id,
            "UserName": user.get("UserName"),
            "Arn": user.get("Arn"),
            "CreateDate": user.get("CreateDate"),
            "AttachedManagedPolicies": user.get("AttachedManagedPolicies", []),
            "GroupList": user.get("GroupList", []),
            "UserPolicyList": user.get("UserPolicyList", []),
            "Tags": user.get("Tags", []),
        }

    # Process roles
    for role in auth_details.get("RoleDetailList", []):
        role_id = role.get("RoleId")
        roles[role_id] = {
            "RoleId": role_id,
            "RoleName": role.get("RoleName"),
            "Arn": role.get("Arn"),
            "CreateDate": role.get("CreateDate"),
            "AssumeRolePolicyDocument": role.get("AssumeRolePolicyDocument", {}),
            "AttachedManagedPolicies": role.get("AttachedManagedPolicies", []),
            "RolePolicyList": role.get("RolePolicyList", []),
            "Tags": role.get("Tags", []),
        }

    # Process policies
    for policy in auth_details.get("Policies", []):
        policy_id = policy.get("PolicyId")
        policies[policy_id] = {
            "PolicyId": policy_id,
            "PolicyName": policy.get("PolicyName"),
            "Arn": policy.get("Arn"),
            "CreateDate": policy.get("CreateDate"),
            "DefaultVersionId": policy.get("DefaultVersionId"),
            "PolicyVersionList": policy.get("PolicyVersionList", []),
            "AttachmentCount": policy.get("AttachmentCount"),
            "IsAttachable": policy.get("IsAttachable"),
            "Description": policy.get("Description", ""),
        }

    # Process groups
    for group in auth_details.get("GroupDetailList", []):
        group_id = group.get("GroupId")
        groups[group_id] = {
            "GroupId": group_id,
            "GroupName": group.get("GroupName"),
            "Arn": group.get("Arn"),
            "CreateDate": group.get("CreateDate"),
            "AttachedManagedPolicies": group.get("AttachedManagedPolicies", []),
            "GroupPolicyList": group.get("GroupPolicyList", []),
        }

    return {"users": users, "roles": roles, "policies": policies, "groups": groups}


@app.route("/dashboard")
def dashboard():
    """
    Display the main dashboard with IAM resources.
    
    Shows an overview of users, roles, policies, and groups from the uploaded IAM data.
    """
    processed_data = get_auth_details()

    if not processed_data:
        flash("No data available. Please upload a file first.")
        return redirect(url_for("index"))

    return render_template(
        "dashboard.html",
        users=processed_data["users"],
        roles=processed_data["roles"],
        policies=processed_data["policies"],
        groups=processed_data["groups"],
    )


@app.route("/user/<user_id>")
def user_details(user_id):
    """
    Display detailed information about a specific IAM user.
    
    Shows user details, group memberships, attached policies, and roles the user can assume.
    
    Args:
        user_id (str): The ID of the user to display
    """
    processed_data = get_auth_details()

    if not processed_data:
        flash("No data available. Please upload a file first.")
        return redirect(url_for("index"))

    user = processed_data["users"].get(user_id)
    if not user:
        flash("User not found")
        return redirect(url_for("dashboard"))

    # Get group details for this user
    user_groups = []
    for group_name in user.get("GroupList", []):
        for group_id, group in processed_data["groups"].items():
            if group["GroupName"] == group_name:
                user_groups.append(group)
                break

    # Get policy details for this user
    user_policies = []
    for policy in user.get("AttachedManagedPolicies", []):
        policy_arn = policy.get("PolicyArn")
        for policy_id, policy_details in processed_data["policies"].items():
            if policy_details["Arn"] == policy_arn:
                user_policies.append(policy_details)
                break

    # Get roles this user can assume
    assumable_roles = []
    for role_id, role in processed_data["roles"].items():
        assume_role_policy = role.get("AssumeRolePolicyDocument", {})
        statements = assume_role_policy.get("Statement", [])

        for statement in statements:
            if statement.get("Effect") != "Allow":
                continue

            principal = statement.get("Principal", {})
            aws_principal = principal.get("AWS", [])

            if isinstance(aws_principal, str):
                aws_principal = [aws_principal]

            for principal_arn in aws_principal:
                if user["Arn"] == principal_arn or principal_arn == "*":
                    assumable_roles.append(role)
                    break

    return render_template(
        "user_details.html",
        user=user,
        user_id=user_id,
        groups=user_groups,
        policies=user_policies,
        assumable_roles=assumable_roles,
    )


@app.route("/role/<role_id>")
def role_details(role_id):
    """
    Display detailed information about a specific IAM role.
    
    Shows role details and attached policies.
    
    Args:
        role_id (str): The ID of the role to display
    """
    processed_data = get_auth_details()

    if not processed_data:
        flash("No data available. Please upload a file first.")
        return redirect(url_for("index"))

    role = processed_data["roles"].get(role_id)
    if not role:
        flash("Role not found")
        return redirect(url_for("dashboard"))

    # Get policy details for this role
    role_policies = []
    for policy in role.get("AttachedManagedPolicies", []):
        policy_arn = policy.get("PolicyArn")
        for policy_id, policy_details in processed_data["policies"].items():
            if policy_details["Arn"] == policy_arn:
                role_policies.append(policy_details)
                break

    return render_template(
        "role_details.html", role=role, role_id=role_id, policies=role_policies
    )


@app.route("/policy/<policy_id>")
def policy_details(policy_id):
    """
    Display detailed information about a specific IAM policy.
    
    Shows policy details, policy document, and entities (users, roles, groups) that have this policy attached.
    
    Args:
        policy_id (str): The ID of the policy to display
    """
    processed_data = get_auth_details()

    if not processed_data:
        flash("No data available. Please upload a file first.")
        return redirect(url_for("index"))

    policy = processed_data["policies"].get(policy_id)
    if not policy:
        flash("Policy not found")
        return redirect(url_for("dashboard"))

    # Find the default policy version document
    policy_document = None
    for version in policy.get("PolicyVersionList", []):
        if version.get("VersionId") == policy.get("DefaultVersionId"):
            policy_document = version.get("Document")
            break

    # Find entities (users, roles, groups) that have this policy attached
    attached_users = []
    attached_roles = []
    attached_groups = []

    policy_arn = policy.get("Arn")

    for user_id, user in processed_data["users"].items():
        for attached_policy in user.get("AttachedManagedPolicies", []):
            if attached_policy.get("PolicyArn") == policy_arn:
                attached_users.append(user)
                break

    for role_id, role in processed_data["roles"].items():
        for attached_policy in role.get("AttachedManagedPolicies", []):
            if attached_policy.get("PolicyArn") == policy_arn:
                attached_roles.append(role)
                break

    for group_id, group in processed_data["groups"].items():
        for attached_policy in group.get("AttachedManagedPolicies", []):
            if attached_policy.get("PolicyArn") == policy_arn:
                attached_groups.append(group)
                break

    return render_template(
        "policy_details.html",
        policy=policy,
        policy_id=policy_id,
        policy_document=policy_document,
        attached_users=attached_users,
        attached_roles=attached_roles,
        attached_groups=attached_groups,
    )


@app.route("/group/<group_id>")
def group_details(group_id):
    """
    Display detailed information about a specific IAM group.
    
    Shows group details, attached policies, and users that are members of this group.
    
    Args:
        group_id (str): The ID of the group to display
    """
    processed_data = get_auth_details()

    if not processed_data:
        flash("No data available. Please upload a file first.")
        return redirect(url_for("index"))

    group = processed_data["groups"].get(group_id)
    if not group:
        flash("Group not found")
        return redirect(url_for("dashboard"))

    # Get policy details for this group
    group_policies = []
    for policy in group.get("AttachedManagedPolicies", []):
        policy_arn = policy.get("PolicyArn")
        for policy_id, policy_details in processed_data["policies"].items():
            if policy_details["Arn"] == policy_arn:
                group_policies.append(policy_details)
                break

    # Find users that are members of this group
    group_users = []
    group_name = group.get("GroupName")

    for user_id, user in processed_data["users"].items():
        if group_name in user.get("GroupList", []):
            group_users.append(user)

    return render_template(
        "group_details.html",
        group=group,
        group_id=group_id,
        policies=group_policies,
        users=group_users,
    )


@app.route("/clear")
def clear_session():
    """
    Clear the current session and delete the uploaded file.
    
    Removes the uploaded file from the server and clears the session data.
    """
    # Delete the uploaded file if it exists
    if "filepath" in session and os.path.exists(session["filepath"]):
        try:
            os.remove(session["filepath"])
        except:
            pass

    session.clear()
    return redirect(url_for("index"))


def get_uploads_metadata():
    """
    Load the metadata for all uploaded files.
    
    Returns:
        dict: Metadata for all uploads or empty dict if file doesn't exist
    """
    if os.path.exists(app.config["UPLOADS_METADATA"]):
        try:
            with open(app.config["UPLOADS_METADATA"], "r") as f:
                return json.load(f)
        except:
            return {}
    return {}


def save_uploads_metadata(metadata):
    """
    Save the metadata for all uploaded files.
    
    Args:
        metadata (dict): Metadata to save
    """
    os.makedirs(os.path.dirname(app.config["UPLOADS_METADATA"]), exist_ok=True)
    with open(app.config["UPLOADS_METADATA"], "w") as f:
        json.dump(metadata, f)


@app.route("/uploads")
def list_uploads():
    """
    Display a list of all uploaded files.
    
    Shows a list of all uploads sorted by upload date (newest first).
    """
    metadata = get_uploads_metadata()

    # Sort by upload date (newest first)
    sorted_uploads = sorted(
        metadata.values(), key=lambda x: x.get("uploaded_at", ""), reverse=True
    )

    return render_template("uploads.html", uploads=sorted_uploads)


@app.route("/switch/<file_id>")
def switch_upload(file_id):
    """
    Switch to a different uploaded file.
    
    Updates the session to use a different previously uploaded file.
    
    Args:
        file_id (str): The ID of the file to switch to
    """
    metadata = get_uploads_metadata()

    if file_id not in metadata:
        flash("Upload not found")
        return redirect(url_for("list_uploads"))

    # Update session
    session["file_id"] = file_id
    session["filepath"] = metadata[file_id]["filepath"]

    return redirect(url_for("dashboard"))


@app.route("/delete/<file_id>")
def delete_upload(file_id):
    """
    Delete a specific uploaded file.
    
    Removes the file from the server and its metadata from the metadata file.
    
    Args:
        file_id (str): The ID of the file to delete
    """
    metadata = get_uploads_metadata()

    if file_id not in metadata:
        flash("Upload not found")
        return redirect(url_for("list_uploads"))

    # Delete the file
    filepath = metadata[file_id]["filepath"]
    if os.path.exists(filepath):
        try:
            os.remove(filepath)
        except:
            pass

    # Remove from metadata
    del metadata[file_id]
    save_uploads_metadata(metadata)

    # Clear session if this was the active file
    if session.get("file_id") == file_id:
        session.pop("file_id", None)
        session.pop("filepath", None)

    flash("Upload deleted successfully")
    return redirect(url_for("list_uploads"))


@app.template_filter("datetime")
def format_datetime(value):
    """
    Template filter to format ISO datetime strings.
    
    Args:
        value (str): ISO datetime string
        
    Returns:
        str: Formatted datetime string
    """
    try:
        dt = datetime.datetime.fromisoformat(value)
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except:
        return value


@app.template_filter("filesize")
def format_filesize(size):
    """
    Template filter to format file sizes in human-readable format.
    
    Args:
        size (int): Size in bytes
        
    Returns:
        str: Human-readable file size
    """
    # Convert bytes to human-readable format
    for unit in ["B", "KB", "MB", "GB"]:
        if size < 1024.0:
            return f"{size:.2f} {unit}"
        size /= 1024.0
    return f"{size:.2f} TB"


if __name__ == "__main__":
    app.run(debug=True)
